import { Test, TestingModule } from '@nestjs/testing';
import { Platform } from '@prisma/client';
import { QueueService } from './queue.service';
import { SchedulerService } from '../scheduler/scheduler.service';
import { EngagementService } from '../engagement/engagement.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { HealthService } from '../health/health.service';
import { PrismaService } from '../../common/prisma/prisma.service';

const mockScheduler = () => ({
  schedule: jest.fn().mockResolvedValue({ id: 'job-1', status: 'QUEUED' }),
  getDueJobs: jest.fn().mockResolvedValue([]),
  executeJob: jest.fn().mockResolvedValue(undefined),
});

const mockEngagement = () => ({
  syncAllTeams: jest.fn().mockResolvedValue([]),
});

const mockAnalytics = () => ({
  scanAllAndAlert: jest.fn().mockResolvedValue([]),
});

const mockHealth = () => ({
  checkThresholdAlerts: jest.fn().mockResolvedValue({ alerts: [], notified: 0 }),
});

describe('QueueService', () => {
  let service: QueueService;
  let scheduler: ReturnType<typeof mockScheduler>;
  let engagement: ReturnType<typeof mockEngagement>;
  let analytics: ReturnType<typeof mockAnalytics>;
  let health: ReturnType<typeof mockHealth>;
  let prisma: any;

  beforeEach(async () => {
    scheduler = mockScheduler();
    engagement = mockEngagement();
    analytics = mockAnalytics();
    health = mockHealth();
    prisma = { team: { findMany: jest.fn().mockResolvedValue([]) } };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QueueService,
        { provide: SchedulerService, useValue: scheduler },
        { provide: EngagementService, useValue: engagement },
        { provide: AnalyticsService, useValue: analytics },
        { provide: HealthService, useValue: health },
        { provide: PrismaService, useValue: prisma },
        { provide: 'QUEUE_KIND', useValue: 'prisma' },
      ],
    }).compile();
    service = module.get(QueueService);
  });

  it('reports the configured queue kind', () => {
    expect(service.kind).toBe('prisma');
  });

  describe('publish / schedulePublish', () => {
    it('publishes a job via SchedulerService', async () => {
      const res = await service.publish('c1', Platform.WECHAT_OFFICIAL, new Date('2026-01-01T00:00:00Z'));
      expect(scheduler.schedule).toHaveBeenCalledWith('c1', 'WECHAT_OFFICIAL', new Date('2026-01-01T00:00:00Z'));
      expect(res.id).toBe('job-1');
    });

    it('schedulePublish is an alias for publish (defaults scheduledAt to now)', async () => {
      await service.schedulePublish({ contentId: 'c1', platform: 'DOUYIN' });
      expect(scheduler.schedule).toHaveBeenCalledWith(
        'c1',
        'DOUYIN',
        expect.any(Date),
      );
    });
  });

  describe('runPublishTick', () => {
    it('processes no jobs when none are due', async () => {
      scheduler.getDueJobs.mockResolvedValue([]);
      const res = await service.runPublishTick(new Date(), 5);
      expect(res.processed).toBe(0);
      expect(scheduler.executeJob).not.toHaveBeenCalled();
    });

    it('executes each due job and reports successes', async () => {
      scheduler.getDueJobs.mockResolvedValue([{ id: 'j1' }, { id: 'j2' }] as any);
      const res = await service.runPublishTick(new Date(), 5);
      expect(res.processed).toBe(2);
      expect(res.succeeded).toBe(2);
      expect(res.failed).toBe(0);
      expect(scheduler.executeJob).toHaveBeenCalledTimes(2);
    });

    it('swallows single-job failures and keeps the tick going', async () => {
      scheduler.getDueJobs.mockResolvedValue([{ id: 'j1' }, { id: 'j2' }] as any);
      scheduler.executeJob.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('boom'));
      const res = await service.runPublishTick(new Date(), 5);
      expect(res.processed).toBe(2);
      expect(res.succeeded).toBe(1);
      expect(res.failed).toBe(1);
    });

    it('respects the limit parameter', async () => {
      scheduler.getDueJobs.mockResolvedValue([{ id: 'j1' }] as any);
      await service.runPublishTick(new Date(), 1);
      expect(scheduler.getDueJobs).toHaveBeenCalledWith(expect.any(Date), 1);
    });

    it('throws for unsupported queue kinds', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          QueueService,
          { provide: SchedulerService, useValue: scheduler },
          { provide: EngagementService, useValue: engagement },
          { provide: AnalyticsService, useValue: analytics },
          { provide: HealthService, useValue: health },
          { provide: PrismaService, useValue: prisma },
          { provide: 'QUEUE_KIND', useValue: 'bullmq' },
        ],
      }).compile();
      const bullmqQueue = module.get(QueueService);
      await expect(bullmqQueue.runPublishTick()).rejects.toThrow(/bullmq/);
    });
  });

  describe('runEngagementSyncTick', () => {
    it('aggregates comment and message counts across teams', async () => {
      engagement.syncAllTeams.mockResolvedValue([
        { teamId: 't1', comments: 5, messages: 2 },
        { teamId: 't2', comments: 0, messages: 8 },
      ] as any);
      const res = await service.runEngagementSyncTick();
      expect(res.teams).toBe(2);
      expect(res.comments).toBe(5);
      expect(res.messages).toBe(10);
    });

    it('returns zeroes when nothing changes', async () => {
      const res = await service.runEngagementSyncTick();
      expect(res).toEqual({ teams: 0, comments: 0, messages: 0 });
    });
  });

  describe('runAnomalyScanTick', () => {
    it('counts accounts, anomalies, and teams alerted', async () => {
      analytics.scanAllAndAlert.mockResolvedValue([
        { accountId: 'a1', anomalies: 2, notified: true },
        { accountId: 'a2', anomalies: 0, notified: false },
      ] as any);
      const res = await service.runAnomalyScanTick();
      expect(res.accounts).toBe(2);
      expect(res.anomalies).toBe(2);
      expect(res.teamsAlerted).toBe(1);
    });
  });

  describe('runThresholdScanTick', () => {
    it('returns zeroes when no teams', async () => {
      prisma.team.findMany.mockResolvedValue([]);
      const res = await service.runThresholdScanTick();
      expect(res).toEqual({ teams: 0, alerts: 0, teamsNotified: 0 });
    });
  });
});
