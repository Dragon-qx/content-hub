import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { PrismaService } from '../../common/prisma/prisma.service';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      socialAccount: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
      platformPost: {
        count: jest.fn(),
        findMany: jest.fn(),
      },
      analyticsSnapshot: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      auditLog: {
        findMany: jest.fn(),
      },
    };

    const module = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(AnalyticsService);
    jest.clearAllMocks();
  });

  describe('getTeamDashboard', () => {
    it('should return team dashboard with aggregated data', async () => {
      prisma.socialAccount.findMany.mockResolvedValue([
        {
          id: 'a1',
          platform: 'WECHAT_OFFICIAL',
          followerCount: 1000,
          followingCount: 100,
          analytics: [{ followerCount: 1200, impressions: 5000, engagements: 200 }],
        },
        {
          id: 'a2',
          platform: 'DOUYIN',
          followerCount: 800,
          followingCount: 50,
          analytics: [{ followerCount: 900, impressions: 3000, engagements: 150 }],
        },
      ]);
      prisma.platformPost.count.mockResolvedValue(50);
      prisma.auditLog.findMany.mockResolvedValue([
        { action: 'create', user: { name: 'Admin' }, createdAt: new Date() },
      ]);

      const result = await service.getTeamDashboard();

      expect(result).toHaveProperty('totalFollowers', 2100);
      expect(result).toHaveProperty('totalFollowing', 150);
      expect(result).toHaveProperty('totalPosts', 50);
      expect(result).toHaveProperty('totalImpressions', 8000);
      expect(result).toHaveProperty('totalEngagements', 350);
      expect(result).toHaveProperty('platformBreakdown');
      expect(result.platformBreakdown).toBeInstanceOf(Array);
      expect(result.platformBreakdown.length).toBe(2);
      expect(result).toHaveProperty('recentActivity');
    });

    it('should return default values when no data', async () => {
      prisma.socialAccount.findMany.mockResolvedValue([]);
      prisma.platformPost.count.mockResolvedValue(0);
      prisma.auditLog.findMany.mockResolvedValue([]);

      const result = await service.getTeamDashboard();

      expect(result.totalFollowers).toBe(0);
      expect(result.totalFollowing).toBe(0);
      expect(result.totalPosts).toBe(0);
      expect(result.platformBreakdown).toEqual([]);
      expect(result.recentActivity).toEqual([]);
    });
  });

  describe('getOverview', () => {
    it('should return core metrics with comparison', async () => {
      const now = new Date();
      const thirtyDaysAgo = new Date(now);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const sixtyDaysAgo = new Date(now);
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

      prisma.analyticsSnapshot.findMany.mockImplementation(({ where }: any) => {
        // 当前周期 vs 上一周期
        const gte = where.snapshotDate?.gte;
        if (gte >= thirtyDaysAgo) {
          return Promise.resolve([
            { accountId: 'a1', snapshotDate: now, followerCount: 1000, impressions: 5000, engagements: 200 },
            { accountId: 'a2', snapshotDate: now, followerCount: 800, impressions: 3000, engagements: 150 },
          ]);
        } else {
          return Promise.resolve([
            { accountId: 'a1', snapshotDate: sixtyDaysAgo, followerCount: 900, impressions: 4500, engagements: 180 },
          ]);
        }
      });

      const result = await service.getOverview(30);

      expect(result).toHaveProperty('period');
      expect(result).toHaveProperty('followers');
      expect(result.followers).toHaveProperty('value');
      expect(result.followers).toHaveProperty('change');
      expect(result).toHaveProperty('following');
      expect(result).toHaveProperty('posts');
      expect(result).toHaveProperty('impressions');
      expect(result).toHaveProperty('engagements');
      expect(result).toHaveProperty('engagementRate');
    });

    it('should handle empty snapshots gracefully', async () => {
      prisma.analyticsSnapshot.findMany.mockResolvedValue([]);

      const result = await service.getOverview(30);

      expect(result.followers.value).toBe(0);
      expect(result.following.value).toBe(0);
      expect(result.posts.value).toBe(0);
      expect(result.impressions.value).toBe(0);
      expect(result.engagements.value).toBe(0);
    });
  });

  describe('getHistory', () => {
    it('should return history data grouped by date', async () => {
      const baseDate = new Date();
      prisma.analyticsSnapshot.findMany.mockResolvedValue([
        { snapshotDate: new Date(baseDate), followerCount: 100, impressions: 500 },
        { snapshotDate: new Date(baseDate.getTime() - 86400000), followerCount: 90, impressions: 450 },
        { snapshotDate: new Date(baseDate.getTime() - 172800000), followerCount: 80, impressions: 400 },
      ]);

      const result = await service.getHistory('followers', '30d');

      expect(result).toHaveProperty('metric', 'followers');
      expect(result).toHaveProperty('period', '30d');
      expect(result).toHaveProperty('data');
      expect(result.data).toBeInstanceOf(Array);
      expect(result.data.length).toBeGreaterThan(0);
      expect(result.data[0]).toHaveProperty('date');
      expect(result.data[0]).toHaveProperty('value');
    });

    it('should return different periods correctly', async () => {
      prisma.analyticsSnapshot.findMany.mockResolvedValue([]);

      const result7d = await service.getHistory('followers', '7d');
      expect(result7d.period).toBe('7d');

      const result90d = await service.getHistory('impressions', '90d');
      expect(result90d.period).toBe('90d');
      expect(result90d.metric).toBe('impressions');
    });

    it('should return empty data when no snapshots', async () => {
      prisma.analyticsSnapshot.findMany.mockResolvedValue([]);

      const result = await service.getHistory('likes', '30d');
      expect(result.data).toEqual([]);
    });
  });

  describe('getTopContent', () => {
    it('should return top content sorted by sortBy field', async () => {
      const now = new Date();
      prisma.platformPost.findMany.mockResolvedValue([
        {
          contentId: 'c1',
          platform: 'WECHAT_OFFICIAL',
          publishedAt: now,
          content: { title: 'Post A' },
          metrics: { impressions: 1000, likes: 100, comments: 10, shares: 5 },
        },
        {
          contentId: 'c2',
          platform: 'DOUYIN',
          publishedAt: now,
          content: { title: 'Post B' },
          metrics: { impressions: 500, likes: 200, comments: 20, shares: 10 },
        },
      ]);

      const result = await service.getTopContent('impressions', 10);

      expect(result).toHaveProperty('sortBy', 'impressions');
      expect(result).toHaveProperty('items');
      expect(result.items).toBeInstanceOf(Array);
      expect(result.items.length).toBeLessThanOrEqual(10);
      expect(result.items[0]).toHaveProperty('contentId');
      expect(result.items[0]).toHaveProperty('title');
      expect(result.items[0]).toHaveProperty('impressions');
      expect(result.items[0]).toHaveProperty('engagementRate');
    });

    it('should return default sortBy impressions when invalid', async () => {
      prisma.platformPost.findMany.mockResolvedValue([
        {
          contentId: 'c1',
          platform: 'WECHAT_OFFICIAL',
          publishedAt: new Date(),
          content: { title: 'Post A' },
          metrics: { impressions: 1000, likes: 100, comments: 10, shares: 5 },
        },
        {
          contentId: 'c2',
          platform: 'DOUYIN',
          publishedAt: new Date(),
          content: { title: 'Post B' },
          metrics: { impressions: 500, likes: 200, comments: 20, shares: 10 },
        },
      ]);

      const result = await service.getTopContent('invalid_field', 10);
      // Should fall back to impressions and sort correctly (1000 first)
      expect(result.items[0].impressions).toBe(1000);
    });

    it('should return empty items when no posts', async () => {
      prisma.platformPost.findMany.mockResolvedValue([]);

      const result = await service.getTopContent('impressions', 10);
      expect(result.items).toEqual([]);
    });
  });

  describe('getAccountMetrics', () => {
    it('should return single account metrics', async () => {
      const now = new Date();
      prisma.socialAccount.findUnique.mockResolvedValue({
        id: 'a1',
        teamId: 't1',
        accountName: '测试账号',
        platform: 'WECHAT_OFFICIAL',
        followerCount: 5000,
        followingCount: 100,
        lastSyncedAt: now,
      });
      prisma.analyticsSnapshot.findFirst.mockResolvedValue({
        followerCount: 5200,
        followingCount: 105,
        postCount: 200,
        impressions: 10000,
        engagements: 500,
      });
      prisma.platformPost.count.mockResolvedValue(200);

      const result = await service.getAccountMetrics('a1');

      expect(result).toHaveProperty('accountId', 'a1');
      expect(result).toHaveProperty('accountName', '测试账号');
      expect(result).toHaveProperty('platform', 'WECHAT_OFFICIAL');
      expect(result).toHaveProperty('followerCount', 5200);
      expect(result).toHaveProperty('followingCount', 105);
      expect(result).toHaveProperty('postCount', 200);
      expect(result).toHaveProperty('impressions', 10000);
      expect(result).toHaveProperty('engagements', 500);
    });

    it('should throw NotFoundException for missing account', async () => {
      prisma.socialAccount.findUnique.mockResolvedValue(null);

      await expect(service.getAccountMetrics('999')).rejects.toThrow(NotFoundException);
    });

    it('should return zero values when no snapshots', async () => {
      prisma.socialAccount.findUnique.mockResolvedValue({
        id: 'a1',
        teamId: 't1',
        accountName: 'Test',
        platform: 'DOUYIN',
        followerCount: null,
        followingCount: null,
        lastSyncedAt: null,
      });
      prisma.analyticsSnapshot.findFirst.mockResolvedValue(null);
      prisma.platformPost.count.mockResolvedValue(0);

      const result = await service.getAccountMetrics('a1');
      expect(result.followerCount).toBe(0);
      expect(result.followingCount).toBe(0);
      expect(result.postCount).toBe(0);
      expect(result.impressions).toBe(0);
      expect(result.engagements).toBe(0);
      expect(result.engagementRate).toBe('0.00%');
    });
  });

  describe('recordSnapshot', () => {
    it('should create a snapshot with given data', async () => {
      const createData = {
        followerCount: 1000,
        impressions: 5000,
        engagements: 200,
      };
      prisma.analyticsSnapshot.create.mockResolvedValue({
        id: 'snap1',
        accountId: 'a1',
        snapshotDate: new Date(),
        ...createData,
      });

      const result = await service.recordSnapshot('a1', createData);

      expect(result).toHaveProperty('id', 'snap1');
      expect(result).toHaveProperty('accountId', 'a1');
      expect(result).toHaveProperty('followerCount', 1000);
      expect(prisma.analyticsSnapshot.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            accountId: 'a1',
            followerCount: 1000,
          }),
        }),
      );
    });

    it('should use current date when no snapshotDate provided', async () => {
      prisma.analyticsSnapshot.create.mockResolvedValue({
        id: 'snap1',
        accountId: 'a1',
        snapshotDate: new Date(),
      });

      const result = await service.recordSnapshot('a1', {});
      expect(result).toHaveProperty('accountId', 'a1');
    });
  });
});
