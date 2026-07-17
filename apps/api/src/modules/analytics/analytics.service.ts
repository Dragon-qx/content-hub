import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

/** A numeric metric tracked per account (the columns summed in analytics). */
export type AnalyticsMetric =
  | 'followerCount'
  | 'followingCount'
  | 'postCount'
  | 'impressions'
  | 'engagements'
  | 'likes'
  | 'comments'
  | 'shares'
  | 'views';

const METRIC_KEYS: readonly AnalyticsMetric[] = [
  'followerCount',
  'followingCount',
  'postCount',
  'impressions',
  'engagements',
  'likes',
  'comments',
  'shares',
  'views',
];

/** Optional payload for recording a snapshot manually. */
export interface SnapshotInput {
  snapshotDate?: string | Date;
  followerCount?: number;
  followingCount?: number;
  postCount?: number;
  impressions?: number;
  engagements?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  views?: number;
  extra?: Prisma.InputJsonValue;
}

/**
 * 数据分析服务
 * 提供团队总览、核心指标、历史趋势、热门内容等功能
 */
@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  // ===== 1. 团队数据总览 =====

  async getTeamDashboard() {
    // 查询所有社交账号
    const accounts = await this.prisma.socialAccount.findMany({
      include: {
        analytics: {
          orderBy: { snapshotDate: 'desc' },
          take: 1, // 每个账号最新快照
        },
      },
    });

    let totalFollowers = 0;
    let totalFollowing = 0;
    let totalImpressions = 0;
    let totalEngagements = 0;
    const platformMap = new Map<string, { followers: number; engagements: number }>();

    for (const acc of accounts) {
      const snap = acc.analytics?.[0];
      const followers = snap?.followerCount ?? acc.followerCount ?? 0;
      const following = snap?.followingCount ?? acc.followingCount ?? 0;
      const impressions = snap?.impressions ?? 0;
      const engagements = snap?.engagements ?? 0;

      totalFollowers += followers;
      totalFollowing += following;
      totalImpressions += impressions;
      totalEngagements += engagements;

      // 各平台聚合
      const existing = platformMap.get(acc.platform) || { followers: 0, engagements: 0 };
      platformMap.set(acc.platform, {
        followers: existing.followers + followers,
        engagements: existing.engagements + engagements,
      });
    }

    // 平台占比
    const platformBreakdown = Array.from(platformMap.entries()).map(([platform, data]) => ({
      platform,
      followers: data.followers,
      percentage: totalFollowers > 0 ? Math.round((data.followers / totalFollowers) * 100) : 0,
    }));

    // 总内容数
    const totalPosts = await this.prisma.platformPost.count();

    // 互动率
    const engagementRate = totalImpressions > 0
      ? ((totalEngagements / totalImpressions) * 100).toFixed(2) + '%'
      : '0.00%';

    // 最近活动（AuditLog）
    const recentActivity = await this.prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { user: { select: { name: true } } },
    });

    return {
      totalFollowers,
      totalFollowing,
      totalPosts,
      totalImpressions,
      totalEngagements,
      engagementRate,
      platformBreakdown,
      recentActivity: recentActivity.map(log => ({
        action: log.action,
        userName: log.user?.name || 'Unknown',
        createdAt: log.createdAt,
      })),
    };
  }

  // ===== 2. 核心指标（含环比对比） =====

  async getOverview(days: number = 30) {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // 上一周期
    const prevEndDate = new Date(startDate);
    prevEndDate.setDate(prevEndDate.getDate() - 1);
    const prevStartDate = new Date(prevEndDate);
    prevStartDate.setDate(prevStartDate.getDate() - days);

    // 查询当前周期快照
    const [currentSnapshots, prevSnapshots] = await Promise.all([
      this.prisma.analyticsSnapshot.findMany({
        where: { snapshotDate: { gte: startDate, lte: endDate } },
      }),
      this.prisma.analyticsSnapshot.findMany({
        where: { snapshotDate: { gte: prevStartDate, lte: prevEndDate } },
      }),
    ]);

    // 取最新版本快照的指标（按 accountId 去重）
    const currentMetrics = this.aggregateMetrics(currentSnapshots);
    const prevMetrics = this.aggregateMetrics(prevSnapshots);

    // 计算环比变化
    const followers = this.buildMetricWithChange(currentMetrics.followers, prevMetrics.followers);
    const following = this.buildMetricWithChange(currentMetrics.following, prevMetrics.following);
    const posts = this.buildMetricWithChange(currentMetrics.posts, prevMetrics.posts);
    const impressions = this.buildMetricWithChange(currentMetrics.impressions, prevMetrics.impressions);
    const engagements = this.buildMetricWithChange(currentMetrics.engagements, prevMetrics.engagements);

    return {
      period: { start: startDate, end: endDate },
      followers,
      following,
      posts,
      impressions,
      engagements,
      engagementRate: currentMetrics.impressions > 0
        ? ((currentMetrics.engagements / currentMetrics.impressions) * 100).toFixed(2) + '%'
        : '0.00%',
    };
  }

  /** 从快照列表中聚合指标（取每个 account 最新一条） */
  private aggregateMetrics(snapshots: Prisma.AnalyticsSnapshotGetPayload<{}>[]) {
    const byAccount = new Map<string, Prisma.AnalyticsSnapshotGetPayload<{}>>();
    for (const s of snapshots) {
      const existing = byAccount.get(s.accountId);
      if (!existing || s.snapshotDate > existing.snapshotDate) {
        byAccount.set(s.accountId, s);
      }
    }
    let followers = 0, following = 0, posts = 0, impressions = 0, engagements = 0;
    for (const s of byAccount.values()) {
      followers += s.followerCount ?? 0;
      following += s.followingCount ?? 0;
      posts += s.postCount ?? 0;
      impressions += s.impressions ?? 0;
      engagements += s.engagements ?? 0;
    }
    return { followers, following, posts, impressions, engagements };
  }

  /** 构建带环比变化的指标 */
  private buildMetricWithChange(current: number, previous: number) {
    const change = previous > 0
      ? (((current - previous) / previous) * 100).toFixed(1) + '%'
      : current > 0 ? '+100.0%' : '0.0%';
    const sign = current >= previous ? '+' : '';
    return { value: current, change: sign + change };
  }

  // ===== 3. 历史趋势 =====

  async getHistory(metric: AnalyticsMetric, period: string) {
    const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const snapshots = await this.prisma.analyticsSnapshot.findMany({
      where: { snapshotDate: { gte: startDate } },
      orderBy: { snapshotDate: 'asc' },
    });

    // 按日期聚合，对同一天多个账号快照取求和
    const dateMap = new Map<string, number>();
    for (const s of snapshots) {
      const dateKey = s.snapshotDate.toISOString().split('T')[0];
      const val = s[metric] ?? 0;
      dateMap.set(dateKey, (dateMap.get(dateKey) || 0) + val);
    }

    const data = Array.from(dateMap.entries()).map(([date, value]) => ({
      date,
      value,
    }));

    return { metric, period, data };
  }

  // ===== 4. 热门内容榜 =====

  async getTopContent(sortBy: AnalyticsMetric = 'impressions', limit: number = 10) {
    const posts = await this.prisma.platformPost.findMany({
      orderBy: { publishedAt: 'desc' },
      take: 100,
      include: {
        content: { select: { title: true } },
      },
    });

    const items = posts.map(p => {
      const metrics = (p.metrics as Record<string, number>) || {};
      const likes = metrics.likes ?? 0;
      const comments = metrics.comments ?? 0;
      const shares = metrics.shares ?? 0;
      const impressions = metrics.impressions ?? 0;
      const engagements = likes + comments + shares;
      const engagementRate = impressions > 0
        ? ((engagements / impressions) * 100).toFixed(2) + '%'
        : '0.00%';

      return {
        contentId: p.contentId,
        title: p.content?.title || '(untitled)',
        platform: p.platform,
        publishedAt: p.publishedAt,
        impressions,
        engagements,
        likes,
        comments,
        shares,
        engagementRate,
      };
    });

    // 排序
    const sortKey = ['impressions', 'engagements', 'likes', 'comments', 'shares'].includes(sortBy)
      ? sortBy : 'impressions';
    items.sort((a, b) => {
      const aVal = a[sortKey as keyof typeof a] as number;
      const bVal = b[sortKey as keyof typeof b] as number;
      return bVal - aVal;
    });

    return { sortBy, items: items.slice(0, limit) };
  }

  // ===== 5. 单账号核心指标 =====

  async getAccountMetrics(accountId: string) {
    const account = await this.prisma.socialAccount.findUnique({
      where: { id: accountId },
    });
    if (!account) throw new NotFoundException(`Account ${accountId} not found`);

    const latestSnapshot = await this.prisma.analyticsSnapshot.findFirst({
      where: { accountId },
      orderBy: { snapshotDate: 'desc' },
    });

    const totalPosts = await this.prisma.platformPost.count({
      where: { content: { teamId: account.teamId } },
    });

    const impressions = latestSnapshot?.impressions ?? 0;
    const engagements = latestSnapshot?.engagements ?? 0;
    const engagementRate = impressions > 0
      ? ((engagements / impressions) * 100).toFixed(2) + '%'
      : '0.00%';

    return {
      accountId,
      accountName: account.accountName,
      platform: account.platform,
      followerCount: latestSnapshot?.followerCount ?? account.followerCount ?? 0,
      followingCount: latestSnapshot?.followingCount ?? account.followingCount ?? 0,
      postCount: latestSnapshot?.postCount ?? totalPosts,
      impressions,
      engagements,
      engagementRate,
      lastSyncedAt: account.lastSyncedAt,
    };
  }

  // ===== 6. 手动快照 =====

  async recordSnapshot(accountId: string, data?: SnapshotInput) {
    const snapshotDate = data?.snapshotDate ? new Date(data.snapshotDate) : new Date();
    return this.prisma.analyticsSnapshot.create({
      data: {
        accountId,
        snapshotDate,
        followerCount: data?.followerCount,
        followingCount: data?.followingCount,
        postCount: data?.postCount,
        impressions: data?.impressions,
        engagements: data?.engagements,
        likes: data?.likes,
        comments: data?.comments,
        shares: data?.shares,
        views: data?.views,
        extra: data?.extra ?? Prisma.JsonNull,
      },
    });
  }
}
