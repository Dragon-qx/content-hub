import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import {
  Anomaly,
  SeriesPoint,
  detectAnomaliesForMetric,
} from './anomaly.detector';
import { ReportConfigDto, ReportFilterDto } from './dto/report.dto';

const maxLimit = (n: number, ceiling: number) => Math.min(n, ceiling);

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

// ===== 7. Custom drag-and-drop reports (PRD §3.5) =====

/** A draggable field surfaced in the report builder UI. */
export interface ReportField {
  id: string;
  label: string;
  category: 'account' | 'content' | 'engagement' | 'time' | 'dimension';
  type: 'number' | 'string' | 'date' | 'percent';
  description?: string;
}

/** Available fields for building a custom report (PRD §3.5). */
export const REPORT_AVAILABLE_FIELDS: ReportField[] = [
  { id: 'followerCount', label: 'Followers', category: 'account', type: 'number', description: 'Follower count' },
  { id: 'followingCount', label: 'Following', category: 'account', type: 'number', description: 'Following count' },
  { id: 'postCount', label: 'Posts', category: 'account', type: 'number', description: 'Post count' },
  { id: 'impressions', label: 'Impressions', category: 'content', type: 'number', description: 'Impression count' },
  { id: 'engagements', label: 'Engagements', category: 'content', type: 'number', description: 'Engagement count' },
  { id: 'likes', label: 'Likes', category: 'engagement', type: 'number', description: 'Like count' },
  { id: 'comments', label: 'Comments', category: 'engagement', type: 'number', description: 'Comment count' },
  { id: 'shares', label: 'Shares', category: 'engagement', type: 'number', description: 'Share count' },
  { id: 'views', label: 'Views', category: 'engagement', type: 'number', description: 'View count' },
  { id: 'engagementRate', label: 'Eng. rate', category: 'content', type: 'percent', description: 'Engagement rate (%)' },
  { id: 'snapshotDate', label: 'Snapshot date', category: 'time', type: 'date', description: 'Date of snapshot' },
  { id: 'publishedAt', label: 'Published', category: 'time', type: 'date', description: 'Publish time' },
  { id: 'platform', label: 'Platform', category: 'dimension', type: 'string', description: 'Social platform' },
  { id: 'accountName', label: 'Account', category: 'dimension', type: 'string', description: 'Account name' },
  { id: 'contentTitle', label: 'Content', category: 'dimension', type: 'string', description: 'Content title' },
];

/** A single generated row for a custom report. */
export interface ReportRow {
  [key: string]: string | number | null | Date;
}

/** Generated report data payload. */
export interface GeneratedReport {
  fields: ReportField[];
  rows: ReportRow[];
  totalCount: number;
  generatedAt: string;
}

/**
 * Performance tier auto-marked relative to the cohort mean (PRD §3.5
 * "排行 Top/Bottom 内容自动标记"). A post is TOP when its ranked metric sits
 * ≥20% above the mean, BOTTOM when ≤50% of the mean, otherwise MID.
 */
export type ContentTier = 'TOP' | 'MID' | 'BOTTOM';

/** Which end of the ranking a caller wants to surface. */
export type TopContentView = 'top' | 'bottom';

/** A single ranked content item (with tier + rank surfaced to the dashboard). */
export interface RankedContentItem {
  contentId: string;
  title: string;
  platform: string;
  publishedAt: Date | null;
  impressions: number;
  engagements: number;
  likes: number;
  comments: number;
  shares: number;
  engagementRate: string;
  rank: number;
  tier: ContentTier;
}

/** Aggregate ranking payload returned to the dashboard. */
export interface ContentRanking {
  sortBy: AnalyticsMetric;
  view: TopContentView;
  summary: { total: number; top: number; mid: number; bottom: number };
  items: RankedContentItem[];
}

/** Metrics that can actually be used to rank content. */
const RANKABLE_METRICS = ['impressions', 'engagements', 'likes', 'comments', 'shares'] as const;

/**
 * Mark a value as TOP / MID / BOTTOM relative to the cohort mean. Pure so it is
 * independently unit-tested. With no signal (mean ≤ 0) everything collapses to
 * MID.
 */
export function classifyTier(value: number, mean: number): ContentTier {
  if (mean <= 0) return 'MID';
  const ratio = value / mean;
  if (ratio >= 1.2) return 'TOP';
  if (ratio < 0.5) return 'BOTTOM';
  return 'MID';
}

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
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
  ) {}

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

  // ===== 4. 内容排行榜（Top / Bottom 自动标记） =====

  /**
   * Rank the most recent content by a metric and auto-mark each item TOP /
   * MID / BOTTOM relative to the cohort mean (PRD §3.5). `view` selects which
   * end of the distribution to surface: 'top' (best-first, default) or
   * 'bottom' (worst-first) — so operators can spot underperformers at a glance.
   */
  async getTopContent(
    sortBy: AnalyticsMetric = 'impressions',
    limit: number = 10,
    view: TopContentView = 'top',
  ): Promise<ContentRanking> {
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

    // Resolve the ranking key (only content-level metrics are rankable).
    const sortKey = RANKABLE_METRICS.includes(sortBy as typeof RANKABLE_METRICS[number])
      ? sortBy : 'impressions';

    // Cohort mean of the ranked metric, used as the tier threshold.
    const values = items.map(i => i[sortKey as keyof typeof i] as number);
    const mean = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;

    // Tag each item with its tier before ordering/slicing.
    const tagged = items.map(it => ({ ...it, tier: classifyTier(it[sortKey as keyof typeof it] as number, mean) }));

    // Order: best-first for 'top', worst-first for 'bottom'.
    tagged.sort((a, b) => {
      const aVal = a[sortKey as keyof typeof a] as number;
      const bVal = b[sortKey as keyof typeof b] as number;
      return view === 'bottom' ? aVal - bVal : bVal - aVal;
    });

    // Slice, then stamp a 1-based rank reflecting the displayed order.
    const ranked = tagged.slice(0, limit).map((it, idx) => ({ ...it, rank: idx + 1 }));

    const summary = {
      total: items.length,
      top: items.filter(i => classifyTier(i[sortKey as keyof typeof i] as number, mean) === 'TOP').length,
      mid: items.filter(i => classifyTier(i[sortKey as keyof typeof i] as number, mean) === 'MID').length,
      bottom: items.filter(i => classifyTier(i[sortKey as keyof typeof i] as number, mean) === 'BOTTOM').length,
    };

    return { sortBy: sortKey, view, summary, items: ranked };
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

  // ===== 6. 异常检测引擎 (PRD §3.5) =====

  /**
   * Convert raw AnalyticsSnapshot rows into a daily series for one metric,
   * taking the latest snapshot per calendar day per account. `null` values are
   * treated as missing (skipped) so they don't poison the average.
   */
  private buildSeries(
    rows: Prisma.AnalyticsSnapshotGetPayload<{}>[],
    metric: AnalyticsMetric,
  ): SeriesPoint[] {
    const byDay = new Map<string, Prisma.AnalyticsSnapshotGetPayload<{}>>();
    for (const r of rows) {
      const day = new Date(r.snapshotDate).toISOString().split('T')[0];
      const existing = byDay.get(day);
      if (!existing || new Date(r.snapshotDate) > new Date(existing.snapshotDate)) {
        byDay.set(day, r);
      }
    }
    return [...byDay.entries()]
      .map(([date, snap]) => ({ date, value: snap[metric] ?? 0 }))
      .filter((p) => p.value !== null && p.value !== undefined) as SeriesPoint[];
  }

  /** Detect anomalies across all monitored metrics for one account. */
  async detectAccountAnomalies(accountId: string): Promise<Anomaly[]> {
    const account = await this.prisma.socialAccount.findUnique({
      where: { id: accountId },
      select: { id: true, accountName: true, teamId: true },
    });
    if (!account) throw new NotFoundException(`Account ${accountId} not found`);

    // Pull the recent history (last ~30 days) once, then slice per metric.
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const rows = await this.prisma.analyticsSnapshot.findMany({
      where: { accountId, snapshotDate: { gte: since } },
      orderBy: { snapshotDate: 'asc' },
    });

    const anomalies: Anomaly[] = [];
    for (const metric of METRIC_KEYS) {
      const series = this.buildSeries(rows, metric);
      anomalies.push(...detectAnomaliesForMetric(series, metric));
    }
    return anomalies;
  }

  /**
   * Scan every monitored metric for one account and broadcast anomalies to the
   * account's team. Uses a turnstile (one alert per signature) so a persistent
   * anomaly does not spam the team on every tick.
   */
  async scanAccountAndAlert(accountId: string): Promise<{
    accountId: string;
    anomalies: number;
    notified: boolean;
  }> {
    const anomalies = await this.detectAccountAnomalies(accountId);
    if (anomalies.length === 0) return { accountId, anomalies: 0, notified: false };

    const account = await this.prisma.socialAccount.findUnique({
      where: { id: accountId },
      select: { accountName: true, teamId: true, platform: true },
    });
    if (!account) {
      return { accountId, anomalies: anomalies.length, notified: false };
    }

    // A signature summarises *what* is firing; if it is unchanged since the
    // last alert we stay quiet (the team already knows about it).
    const signature = anomalies
      .map((a) => `${a.type}:${a.metric}`)
      .sort()
      .join('|');
    const existing = await this.prisma.anomalyAlert.findFirst({
      where: { accountId },
      orderBy: { createdAt: 'desc' },
    });
    if (existing && existing.signature === signature) {
      return { accountId, anomalies: anomalies.length, notified: false };
    }

    try {
      await this.notifications.broadcastToTeam(account.teamId, {
        type: 'warning',
        title: `Analytics anomaly on ${account.platform}`,
        body: `${account.accountName}: ${anomalies.length} anomaly(s) detected — ${anomalies
          .map((a) => a.message)
          .slice(0, 3)
          .join('; ')}`,
        link: '/analytics',
        metadata: { account: accountId, count: anomalies.length, signature },
      });
    } catch (err) {
      // Alerting must never break the scan pipeline.
      this.logger.warn(
        `Anomaly alert broadcast failed for ${accountId}: ${
          err instanceof Error ? err.message : err
        }`,
      );
    }

    // Record the alert signature so the next tick is deduped.
    await this.prisma.anomalyAlert.create({
      data: { accountId, teamId: account.teamId, signature, count: anomalies.length },
    });

    return { accountId, anomalies: anomalies.length, notified: true };
  }

  /** Scan all accounts and alert each team. Returns a per-account summary. */
  async scanAllAndAlert(): Promise<
    { accountId: string; anomalies: number; notified: boolean }[]
  > {
    const accounts = await this.prisma.socialAccount.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true },
      distinct: ['id'],
    });
    const results = [];
    for (const acc of accounts) {
      try {
        results.push(await this.scanAccountAndAlert(acc.id));
      } catch (err) {
        this.logger.warn(
          `Anomaly scan skipped account ${acc.id}: ${
            err instanceof Error ? err.message : err
          }`,
        );
      }
    }
    return results;
  }

  /** Fetch the most recent alert records (for an admin/audit surface). */
  listAlerts(params: { teamId?: string; accountId?: string; take?: number }) {
    const where: Prisma.AnomalyAlertWhereInput = {};
    if (params.accountId) where.accountId = params.accountId;
    if (params.teamId) where.teamId = params.teamId;
    return this.prisma.anomalyAlert.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: params.take ?? 50,
    });
  }

  // ===== 8. 自定义报表（拖拽生成, PRD §3.5）=====

  /** Return the draggable field list grouped for the report builder UI. */
  getAvailableFields(): { categories: { category: string; fields: ReportField[] }[] } {
    const grouped = new Map<string, ReportField[]>();
    for (const f of REPORT_AVAILABLE_FIELDS) {
      const list = grouped.get(f.category) ?? [];
      list.push(f);
      grouped.set(f.category, list);
    }
    const categories = Array.from(grouped.entries()).map(([category, fields]) => ({
      category,
      fields,
    }));
    return { categories };
  }

  /**
   * Generate a report from the selected fields. Pulls data from both
   * AnalyticsSnapshot (account metrics) and PlatformPost (content metrics).
   */
  async generateReport(
    fieldIds: string[],
    filters?: ReportFilterDto[],
    groupBy?: string,
    sortBy?: string,
    sortDir: 'asc' | 'desc' = 'desc',
    limit = 100,
  ): Promise<GeneratedReport> {
    const fields = REPORT_AVAILABLE_FIELDS.filter((f) => fieldIds.includes(f.id));

    // Pull the latest snapshot per account + their recent posts.
    const accounts = await this.prisma.socialAccount.findMany({
      include: {
        analytics: { orderBy: { snapshotDate: 'desc' }, take: 1 },
      },
    });

    const posts = await this.prisma.platformPost.findMany({
      orderBy: { publishedAt: 'desc' },
      take: maxLimit(limit * 5, 2000),
      include: { content: { select: { title: true } } },
    });

    const rows: ReportRow[] = [];

    // Build a row per post (content-scope) and a per-account summary row.
    for (const post of posts) {
      const metrics = (post.metrics as Record<string, number>) || {};
      const impressions = metrics.impressions ?? 0;
      const likes = metrics.likes ?? 0;
      const comments = metrics.comments ?? 0;
      const shares = metrics.shares ?? 0;
      const engagements = likes + comments + shares;
      const engagementRate = impressions > 0
        ? +((engagements / impressions) * 100).toFixed(2)
        : 0;

      const row: ReportRow = {
        platform: post.platform,
        accountName: '-',
        contentTitle: post.content?.title ?? '(untitled)',
        impressions,
        engagements,
        likes,
        comments,
        shares,
        views: metrics.views ?? 0,
        engagementRate,
        publishedAt: post.publishedAt,
        snapshotDate: null,
        followerCount: null,
        followingCount: null,
        postCount: null,
      };
      rows.push(row);
    }

    // Per-account summary rows
    for (const acc of accounts) {
      const snap = acc.analytics?.[0];
      const row: ReportRow = {
        platform: acc.platform,
        accountName: acc.accountName,
        contentTitle: '-',
        followerCount: snap?.followerCount ?? acc.followerCount ?? 0,
        followingCount: snap?.followingCount ?? acc.followingCount ?? 0,
        postCount: snap?.postCount ?? acc.postCount ?? 0,
        impressions: snap?.impressions ?? 0,
        engagements: snap?.engagements ?? 0,
        likes: snap?.likes ?? 0,
        comments: snap?.comments ?? 0,
        shares: snap?.shares ?? 0,
        views: snap?.views ?? 0,
        engagementRate:
          snap && snap.impressions && snap.impressions > 0
            ? +((snap.engagements ?? 0 / snap.impressions) * 100).toFixed(2)
            : 0,
        snapshotDate: snap?.snapshotDate ?? null,
        publishedAt: null,
      };
      rows.push(row);
    }

    // Apply filters
    let filtered = rows;
    if (filters && filters.length > 0) {
      filtered = rows.filter((row) =>
        filters.every((f) => {
          const val = row[f.field];
          if (val === null || val === undefined) return false;
          switch (f.operator) {
            case 'eq':
              return String(val) === String(f.value);
            case 'neq':
              return String(val) !== String(f.value);
            case 'gt':
              return Number(val) > Number(f.value);
            case 'gte':
              return Number(val) >= Number(f.value);
            case 'lt':
              return Number(val) < Number(f.value);
            case 'lte':
              return Number(val) <= Number(f.value);
            case 'in':
              return Array.isArray(f.value) && f.value.includes(String(val));
            default:
              return true;
          }
        }),
      );
    }

    // Group-by: aggregate numeric values for unique values of the group-by field.
    if (groupBy) {
      const groups = new Map<string, ReportRow>();
      for (const row of filtered) {
        const key = String(row[groupBy] ?? 'unknown');
        const existing = groups.get(key);
        if (!existing) {
          groups.set(key, { ...row });
        } else {
          // Sum numeric fields
          for (const f of fields) {
            if (f.type === 'number' && f.id !== groupBy) {
              const num = Number(row[f.id] ?? 0);
              existing[f.id] = (existing[f.id] as number) + num;
            }
          }
        }
      }
      filtered = Array.from(groups.values());
    }

    // Sort
    const effectiveSortBy = sortBy ?? fieldIds[0];
    if (effectiveSortBy) {
      filtered.sort((a, b) => {
        const av = a[effectiveSortBy];
        const bv = b[effectiveSortBy];
        if (av === null || av === undefined) return 1;
        if (bv === null || bv === undefined) return -1;
        if (typeof av === 'number' && typeof bv === 'number') {
          return sortDir === 'asc' ? av - bv : bv - av;
        }
        return sortDir === 'asc'
          ? String(av).localeCompare(String(bv))
          : String(bv).localeCompare(String(av));
      });
    }

    const totalCount = filtered.length;
    filtered = filtered.slice(0, limit);

    return { fields, rows: filtered, totalCount, generatedAt: new Date().toISOString() };
  }

  /** Save or update a custom report configuration. */
  async saveReport(
    teamId: string,
    userId: string,
    config: ReportConfigDto & { id?: string; name: string },
  ) {
    const { id, name, description, fieldIds, filters, groupBy, sortBy, sortDir, limit } = config;
    const data = {
      teamId,
      name,
      description: description ?? null,
      fieldIds: fieldIds as string[],
      filtersJson: JSON.stringify(filters ?? []),
      groupBy: groupBy ?? null,
      sortBy: sortBy ?? null,
      sortDir: sortDir ?? 'desc',
      createdBy: userId,
    };

    if (id) {
      return this.prisma.customReport.update({ where: { id }, data });
    }
    return this.prisma.customReport.create({ data });
  }

  /** List saved reports for a team. */
  listReports(teamId: string) {
    return this.prisma.customReport.findMany({
      where: { teamId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        teamId: true,
        name: true,
        description: true,
        fieldIds: true,
        filtersJson: true,
        groupBy: true,
        sortBy: true,
        sortDir: true,
        createdBy: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  /** Fetch a single saved report. */
  async getReport(reportId: string) {
    const report = await this.prisma.customReport.findUnique({ where: { id: reportId } });
    if (!report) throw new NotFoundException(`Report ${reportId} not found`);
    return report;
  }

  /** Delete a saved report. */
  async deleteReport(reportId: string) {
    await this.getReport(reportId); // throws if missing
    await this.prisma.customReport.delete({ where: { id: reportId } });
    return { success: true, deletedId: reportId };
  }

  // ===== 7. 手动快照 =====

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
