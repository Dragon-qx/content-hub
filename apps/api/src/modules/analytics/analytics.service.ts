import { Injectable } from '@nestjs/common';

@Injectable()
export class AnalyticsService {
  constructor() {}

  async getDashboard(accountId: string, dateRange: any) {
    return {
      accountId,
      period: dateRange,
      overview: {
        followers: 0,
        following: 0,
        posts: 0,
        impressions: 0,
        engagements: 0,
      },
      engagement: {
        likes: 0,
        comments: 0,
        shares: 0,
        views: 0,
      },
      topPosts: [],
      growth: [],
    };
  }

  async getAccountMetrics(accountId: string) {
    return {
      accountId,
      followers: 0,
      following: 0,
      totalPosts: 0,
      engagementRate: 0,
    };
  }

  async recordSnapshot(accountId: string) {
    return {
      id: `snap-${Date.now()}`,
      accountId,
      snapshotDate: new Date(),
    };
  }

  async getHistorical(accountId: string, metric: string, period: string) {
    return { accountId, metric, period, data: [] };
  }
}
