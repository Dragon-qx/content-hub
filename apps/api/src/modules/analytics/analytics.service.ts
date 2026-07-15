import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard(accountId: string, dateRange: any = {}) {
    const account = await this.prisma.socialAccount.findUnique({
      where: { id: accountId },
    });
    if (!account) throw new NotFoundException(`Account ${accountId} not found`);

    const where: any = { accountId };
    if (dateRange.start || dateRange.end) {
      where.createdAt = {};
      if (dateRange.start) where.createdAt.gte = new Date(dateRange.start);
      if (dateRange.end) where.createdAt.lte = new Date(dateRange.end);
    }

    const [latestSnapshot, posts, workflows] = await Promise.all([
      this.prisma.analyticsSnapshot.findFirst({
        where: { accountId },
        orderBy: { snapshotDate: 'desc' },
      }),
      this.prisma.platformPost.count({
        where: { content: { teamId: account.teamId } },
      }),
      this.prisma.workflow.count({
        where: { content: { teamId: account.teamId } },
      }),
    ]);

    return {
      accountId,
      period: dateRange,
      overview: {
        followers: account.followerCount ?? 0,
        following: account.followingCount ?? 0,
        posts: account.postCount ?? posts,
        impressions: latestSnapshot?.impressions ?? 0,
        engagements: latestSnapshot?.engagements ?? 0,
      },
      engagement: {
        likes: latestSnapshot?.likes ?? 0,
        comments: latestSnapshot?.comments ?? 0,
        shares: latestSnapshot?.shares ?? 0,
        views: latestSnapshot?.views ?? 0,
      },
      topPosts: [],
      growth: [],
    };
  }

  async getAccountMetrics(accountId: string) {
    const account = await this.prisma.socialAccount.findUnique({
      where: { id: accountId },
    });
    if (!account) throw new NotFoundException(`Account ${accountId} not found`);

    const [_snapshots, totalPosts, totalImpressions, totalEngagements] =
      await Promise.all([
        this.prisma.analyticsSnapshot.findMany({
          where: { accountId },
          orderBy: { snapshotDate: 'asc' },
        }),
        this.prisma.platformPost.count({
          where: { content: { teamId: account.teamId } },
        }),
        // We'll just return the latest snapshot values for now
        this.prisma.analyticsSnapshot.findFirst({
          where: { accountId },
          orderBy: { snapshotDate: 'desc' },
        }),
        this.prisma.analyticsSnapshot.findFirst({
          where: { accountId },
          orderBy: { snapshotDate: 'desc' },
        }),
      ]);

    const totalLikes = totalEngagements?.likes ?? 0;
    const totalViews = totalEngagements?.views ?? 1;
    const engagementRate = totalViews > 0 ? ((totalLikes / totalViews) * 100).toFixed(2) : '0.00';

    return {
      accountId,
      followers: account.followerCount ?? 0,
      following: account.followingCount ?? 0,
      totalPosts,
      impressions: totalImpressions?.impressions ?? 0,
      engagementRate: `${engagementRate}%`,
    };
  }

  async recordSnapshot(accountId: string, data?: any) {
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
        extra: data?.extra || null,
      },
    });
  }

  async getHistorical(accountId: string, metric: string, period: string) {
    const days = period === '30d' ? 30 : period === '7d' ? 7 : 90;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const snapshots = await this.prisma.analyticsSnapshot.findMany({
      where: {
        accountId,
        snapshotDate: { gte: startDate },
      },
      orderBy: { snapshotDate: 'asc' },
    });

    const data = snapshots.map((s: any) => ({
      date: s.snapshotDate,
      value: s[metric] ?? 0,
    }));

    return { accountId, metric, period, data };
  }
}
