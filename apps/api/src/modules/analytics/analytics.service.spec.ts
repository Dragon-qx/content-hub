import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AnalyticsService, classifyTier } from './analytics.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let prisma: any;
  let notifications: any;

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
      anomalyAlert: {
        findFirst: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
      },
    };
    notifications = {
      broadcastToTeam: jest.fn().mockResolvedValue({ count: 0 }),
    };

    const module = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationService, useValue: notifications },
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

      const result = await service.getHistory('followerCount', '30d');

      expect(result).toHaveProperty('metric', 'followerCount');
      expect(result).toHaveProperty('period', '30d');
      expect(result).toHaveProperty('data');
      expect(result.data).toBeInstanceOf(Array);
      expect(result.data.length).toBeGreaterThan(0);
      expect(result.data[0]).toHaveProperty('date');
      expect(result.data[0]).toHaveProperty('value');
    });

    it('should return different periods correctly', async () => {
      prisma.analyticsSnapshot.findMany.mockResolvedValue([]);

      const result7d = await service.getHistory('followerCount', '7d');
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

    it('should sort by the requested metric', async () => {
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

      // Sorted by likes descending (200 first)
      const result = await service.getTopContent('likes', 10);
      expect(result.sortBy).toBe('likes');
      expect(result.items[0].title).toBe('Post B');

      // Sorted by impressions descending (1000 first)
      const resultImp = await service.getTopContent('impressions', 10);
      expect(resultImp.items[0].impressions).toBe(1000);
    });

    it('should return empty items when no posts', async () => {
      prisma.platformPost.findMany.mockResolvedValue([]);

      const result = await service.getTopContent('impressions', 10);
      expect(result.items).toEqual([]);
    });

    it('auto-marks TOP / MID / BOTTOM tiers relative to the cohort mean', async () => {
      const now = new Date();
      // Mean impressions = 700. High (1200, ratio 1.71) → TOP, Mid (800,
      // ratio 1.14) → MID, Low (100, ratio 0.14) → BOTTOM.
      prisma.platformPost.findMany.mockResolvedValue([
        {
          contentId: 'c1',
          platform: 'WECHAT_OFFICIAL',
          publishedAt: now,
          content: { title: 'High' },
          metrics: { impressions: 1200, likes: 120, comments: 0, shares: 0 },
        },
        {
          contentId: 'c2',
          platform: 'DOUYIN',
          publishedAt: now,
          content: { title: 'Mid' },
          metrics: { impressions: 800, likes: 80, comments: 0, shares: 0 },
        },
        {
          contentId: 'c3',
          platform: 'BILIBILI',
          publishedAt: now,
          content: { title: 'Low' },
          metrics: { impressions: 100, likes: 1, comments: 0, shares: 0 },
        },
      ]);

      const result = await service.getTopContent('impressions', 10);

      const byTitle = (t: string) => result.items.find((i) => i.title === t)!;
      expect(byTitle('High').tier).toBe('TOP');
      expect(byTitle('Mid').tier).toBe('MID');
      expect(byTitle('Low').tier).toBe('BOTTOM');
    });

    it('summarises the tier distribution across the whole cohort', async () => {
      const now = new Date();
      prisma.platformPost.findMany.mockResolvedValue([
        {
          contentId: 'c1', platform: 'WECHAT_OFFICIAL', publishedAt: now,
          content: { title: 'High' }, metrics: { impressions: 1000, likes: 0, comments: 0, shares: 0 },
        },
        {
          contentId: 'c2', platform: 'DOUYIN', publishedAt: now,
          content: { title: 'Low' }, metrics: { impressions: 10, likes: 0, comments: 0, shares: 0 },
        },
      ]);

      const result = await service.getTopContent('impressions', 10);
      expect(result.view).toBe('top');
      expect(result.summary.total).toBe(2);
      expect(result.summary.top).toBe(1);
      expect(result.summary.bottom).toBe(1);
      expect(result.summary.mid).toBe(0);
      // best-first: highest impressions ranked #1
      expect(result.items[0].rank).toBe(1);
      expect(result.items[0].title).toBe('High');
    });

    it('surfaces underperformers first when view is bottom', async () => {
      const now = new Date();
      prisma.platformPost.findMany.mockResolvedValue([
        {
          contentId: 'c1', platform: 'WECHAT_OFFICIAL', publishedAt: now,
          content: { title: 'High' }, metrics: { impressions: 1000, likes: 0, comments: 0, shares: 0 },
        },
        {
          contentId: 'c2', platform: 'DOUYIN', publishedAt: now,
          content: { title: 'Low' }, metrics: { impressions: 50, likes: 0, comments: 0, shares: 0 },
        },
        {
          contentId: 'c3', platform: 'BILIBILI', publishedAt: now,
          content: { title: 'Mid' }, metrics: { impressions: 200, likes: 0, comments: 0, shares: 0 },
        },
      ]);

      const result = await service.getTopContent('impressions', 10, 'bottom');
      expect(result.view).toBe('bottom');
      // worst-first: lowest impressions ranked #1
      expect(result.items[0].title).toBe('Low');
      expect(result.items[0].rank).toBe(1);
      expect(result.items[result.items.length - 1].title).toBe('High');
      result.items.forEach((it) => expect(it.tier).toBeDefined());
    });
  });

  describe('classifyTier', () => {
    it('collapses to MID when there is no signal', () => {
      expect(classifyTier(0, 0)).toBe('MID');
      expect(classifyTier(99, 0)).toBe('MID');
    });

    it('marks TOP at ≥1.2× the mean and BOTTOM at ≤0.5× the mean', () => {
      expect(classifyTier(120, 100)).toBe('TOP');
      expect(classifyTier(119, 100)).toBe('MID');
      expect(classifyTier(50, 100)).toBe('MID');
      expect(classifyTier(49, 100)).toBe('BOTTOM');
      expect(classifyTier(80, 100)).toBe('MID');
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

  // ── Anomaly detection engine (PRD §3.5) ────────────────────────────────

  describe('detectAccountAnomalies', () => {
    it('builds a daily series per metric and surfaces anomalies', async () => {
      prisma.socialAccount.findUnique.mockResolvedValue({
        id: 'a1',
        accountName: 'Test',
        teamId: 't1',
      });
      // 8 days at impressions=100, then a cliff to 10 on the latest day.
      const rows = [];
      const base = new Date();
      for (let i = 7; i >= 1; i--) {
        const d = new Date(base);
        d.setDate(d.getDate() - i);
        rows.push({ accountId: 'a1', snapshotDate: d, impressions: 100 });
      }
      const last = new Date(base);
      rows.push({ accountId: 'a1', snapshotDate: last, impressions: 10 });
      prisma.analyticsSnapshot.findMany.mockResolvedValue(rows);

      const result = await service.detectAccountAnomalies('a1');

      expect(result.length).toBeGreaterThan(0);
      // The 10 vs 1000-ish cliff should yield a CLIFF_DROP and/or DROP_SPIKE.
      expect(result.some((a) => a.type === 'CLIFF_DROP' || a.type === 'DROP_SPIKE')).toBe(true);
    });

    it('returns an empty array when there is no history', async () => {
      prisma.socialAccount.findUnique.mockResolvedValue({
        id: 'a1',
        accountName: 'Test',
        teamId: 't1',
      });
      prisma.analyticsSnapshot.findMany.mockResolvedValue([]);

      const result = await service.detectAccountAnomalies('a1');
      expect(result).toEqual([]);
    });

    it('throws NotFoundException for a missing account', async () => {
      prisma.socialAccount.findUnique.mockResolvedValue(null);
      await expect(service.detectAccountAnomalies('nope')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('scanAccountAndAlert', () => {
    it('broadcasts to the team when anomalies are new', async () => {
      // Detector: a cliff on impressions.
      prisma.socialAccount.findUnique
        .mockResolvedValueOnce({ id: 'a1', accountName: 'Test', teamId: 't1' }) // detect
        .mockResolvedValueOnce({
          id: 'a1',
          accountName: 'Test',
          teamId: 't1',
          platform: 'DOUYIN',
        }); // alert
      const rows = [
        { accountId: 'a1', snapshotDate: new Date(Date.now() - 86400000), impressions: 100 },
        { accountId: 'a1', snapshotDate: new Date(), impressions: 10 },
      ];
      prisma.analyticsSnapshot.findMany.mockResolvedValue(rows);
      prisma.anomalyAlert.findFirst.mockResolvedValue(null); // no prior alert

      const result = await service.scanAccountAndAlert('a1');

      expect(result.notified).toBe(true);
      expect(result.anomalies).toBeGreaterThan(0);
      expect(notifications.broadcastToTeam).toHaveBeenCalledTimes(1);
      expect(prisma.anomalyAlert.create).toHaveBeenCalledTimes(1);
    });

    it('does not re-alert when the signature is unchanged', async () => {
      prisma.socialAccount.findUnique
        .mockResolvedValueOnce({ id: 'a1', accountName: 'Test', teamId: 't1' })
        .mockResolvedValueOnce({
          id: 'a1',
          accountName: 'Test',
          teamId: 't1',
          platform: 'DOUYIN',
        });
      const rows = [
        { accountId: 'a1', snapshotDate: new Date(Date.now() - 86400000), impressions: 100 },
        { accountId: 'a1', snapshotDate: new Date(), impressions: 10 },
      ];
      prisma.analyticsSnapshot.findMany.mockResolvedValue(rows);
      // Prior alert with the same computed signature → stay quiet.
      prisma.anomalyAlert.findFirst.mockResolvedValue({
        id: 'p1',
        signature: 'CLIFF_DROP:impressions',
      });

      const result = await service.scanAccountAndAlert('a1');

      expect(result.notified).toBe(false);
      expect(notifications.broadcastToTeam).not.toHaveBeenCalled();
    });
  });

  describe('scanAllAndAlert', () => {
    it('scans every active account and returns a summary', async () => {
      prisma.socialAccount.findMany.mockResolvedValue([
        { id: 'a1' },
        { id: 'a2' },
      ]);
      prisma.socialAccount.findUnique
        .mockResolvedValueOnce({ id: 'a1', accountName: 'A', teamId: 't1' })
        .mockResolvedValueOnce({ id: 'a1', accountName: 'A', teamId: 't1', platform: 'DOUYIN' })
        .mockResolvedValueOnce({ id: 'a2', accountName: 'B', teamId: 't1' })
        .mockResolvedValueOnce({ id: 'a2', accountName: 'B', teamId: 't1', platform: 'DOUYIN' });
      prisma.analyticsSnapshot.findMany.mockResolvedValue([]);
      prisma.anomalyAlert.findFirst.mockResolvedValue(null);

      const results = await service.scanAllAndAlert();

      expect(results.length).toBe(2);
      // No history means no anomalies → count 0 for both.
      expect(results[0].anomalies).toBe(0);
      expect(results[1].anomalies).toBe(0);
      expect(notifications.broadcastToTeam).not.toHaveBeenCalled();
    });
  });

  describe('listAlerts', () => {
    it('delegates to prisma with the supplied filters', async () => {
      prisma.anomalyAlert.findMany.mockResolvedValue([{ id: 'x1' }]);
      const result = await service.listAlerts({ teamId: 't1', take: 10 });
      expect(prisma.anomalyAlert.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { teamId: 't1' },
          take: 10,
        }),
      );
      expect(result).toEqual([{ id: 'x1' }]);
    });
  });
});
