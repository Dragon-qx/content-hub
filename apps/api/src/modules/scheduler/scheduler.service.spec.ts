import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { JobStatus } from '@prisma/client';
import { SchedulerService, MAX_RETRY } from './scheduler.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PlatformSdkService } from '../platform-sdk/platform-sdk.service';

describe('SchedulerService', () => {
  let service: SchedulerService;
  let prisma: any;
  let platformSdk: any;

  beforeEach(async () => {
    prisma = {
      content: { findUnique: jest.fn().mockResolvedValue({ id: 'c1', teamId: 'team-1' }) },
      socialAccount: { findFirst: jest.fn().mockResolvedValue({ id: 'acc-1' }) },
      publishJob: {
        create: jest.fn().mockResolvedValue({ id: 'job-1', status: JobStatus.QUEUED, platform: 'WECHAT_OFFICIAL' }),
        findUnique: jest.fn().mockResolvedValue({ id: 'job-1', status: JobStatus.QUEUED, retryCount: 0, contentId: 'c1', platform: 'WECHAT_OFFICIAL', accountId: 'acc-1' }),
        findMany: jest.fn().mockResolvedValue([{ id: 'job-1' }]),
        update: jest.fn().mockResolvedValue({ id: 'job-1' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    platformSdk = {
      publish: jest.fn().mockResolvedValue({ postId: 'post-1', status: 'PUBLISHED', publishedAt: new Date(), externalId: 'ext', externalUrl: 'http://x' }),
    };

    const module = await Test.createTestingModule({
      providers: [
        SchedulerService,
        { provide: PrismaService, useValue: prisma },
        { provide: PlatformSdkService, useValue: platformSdk },
      ],
    }).compile();

    service = module.get(SchedulerService);
    jest.clearAllMocks();
  });

  describe('schedule', () => {
    it('should schedule a job with platform + resolved account', async () => {
      const result = await service.schedule('c1', 'WECHAT_OFFICIAL', new Date('2026-01-01'));
      expect(result.status).toBe(JobStatus.QUEUED);
      expect(prisma.socialAccount.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { teamId: 'team-1', platform: 'WECHAT_OFFICIAL' } }),
      );
      expect(prisma.publishJob.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            platform: 'WECHAT_OFFICIAL',
            accountId: 'acc-1',
          }),
        }),
      );
    });

    it('should reject schedule for missing content', async () => {
      prisma.content.findUnique.mockResolvedValueOnce(null);
      await expect(service.schedule('bad', 'WECHAT_OFFICIAL', new Date())).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('executeJob', () => {
    it('publishes via SDK, marks COMPLETED and links the post', async () => {
      const ok = jest.spyOn(platformSdk, 'publish');
      await service.executeJob('job-1');
      expect(ok).toHaveBeenCalledWith('c1', 'WECHAT_OFFICIAL', {}, 'acc-1');
      // markRunning (updateMany) + final update
      expect(prisma.publishJob.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: 'job-1',
            status: { in: [JobStatus.QUEUED, JobStatus.RETRYING] },
          },
          data: expect.objectContaining({ status: JobStatus.RUNNING }),
        }),
      );
      expect(prisma.publishJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'job-1' },
          data: expect.objectContaining({ status: JobStatus.COMPLETED }),
        }),
      );
    });

    it('skips execution when the job was already claimed by another worker', async () => {
      prisma.publishJob.updateMany.mockResolvedValueOnce({ count: 0 });
      await service.executeJob('job-1');
      expect(platformSdk.publish).not.toHaveBeenCalled();
    });

    it('no-op if job already completed', async () => {
      prisma.publishJob.findUnique.mockResolvedValueOnce({ id: 'job-1', status: JobStatus.COMPLETED });
      await service.executeJob('job-1');
      expect(platformSdk.publish).not.toHaveBeenCalled();
    });

    it('marks FAILED after exceeding MAX_RETRY', async () => {
      prisma.publishJob.findUnique.mockResolvedValue({
        id: 'job-1',
        status: JobStatus.QUEUED,
        retryCount: MAX_RETRY - 1,
        contentId: 'c1',
        platform: 'WECHAT_OFFICIAL',
        accountId: 'acc-1',
      });
      platformSdk.publish.mockRejectedValueOnce(new Error('boom'));
      await service.executeJob('job-1');
      const updateCalls = prisma.publishJob.update.mock.calls;
      const last = updateCalls[updateCalls.length - 1][0];
      expect(last.data.status).toBe(JobStatus.FAILED);
      expect(last.data.retryCount).toBe(MAX_RETRY);
    });

    it('sets RETRYING (not FAILED) below MAX_RETRY', async () => {
      prisma.publishJob.findUnique.mockResolvedValue({
        id: 'job-1',
        status: JobStatus.QUEUED,
        retryCount: 0,
        contentId: 'c1',
        platform: 'WECHAT_OFFICIAL',
        accountId: 'acc-1',
      });
      platformSdk.publish.mockRejectedValueOnce(new Error('boom'));
      await service.executeJob('job-1');
      const updateCalls = prisma.publishJob.update.mock.calls;
      const last = updateCalls[updateCalls.length - 1][0];
      expect(last.data.status).toBe(JobStatus.RETRYING);
      expect(last.data.retryCount).toBe(1);
    });
  });

  describe('getDueJobs', () => {
    it('returns due QUEUED/RETRYING jobs up to the limit', async () => {
      const result = await service.getDueJobs(new Date(), 5);
      expect(prisma.publishJob.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: { in: [JobStatus.QUEUED, JobStatus.RETRYING] }, scheduledAt: { lte: expect.any(Date) } },
          take: 5,
        }),
      );
      expect(result).toHaveLength(1);
    });
  });

  it('should cancel a job', async () => {
    prisma.publishJob.findUnique.mockResolvedValueOnce({ id: 'job-1', status: JobStatus.QUEUED });
    prisma.publishJob.update.mockResolvedValueOnce({ id: 'job-1', status: JobStatus.CANCELLED });
    const result = await service.cancel('job-1');
    expect(result.status).toBe(JobStatus.CANCELLED);
  });

  it('should reject cancel for missing job', async () => {
    prisma.publishJob.findUnique.mockResolvedValue(null);
    await expect(service.cancel('bad')).rejects.toThrow(NotFoundException);
  });

  it('should retry a failed job', async () => {
    prisma.publishJob.findUnique.mockResolvedValueOnce({ id: 'job-1', status: JobStatus.FAILED });
    prisma.publishJob.update.mockResolvedValueOnce({ id: 'job-1', status: JobStatus.QUEUED, retryCount: 1 });
    const result = await service.retry('job-1');
    expect(result.status).toBe(JobStatus.QUEUED);
  });

  it('should list jobs with pagination', async () => {
    prisma.publishJob.findMany.mockResolvedValueOnce([{ id: 'job-1' }]);
    prisma.publishJob.count.mockResolvedValueOnce(1);
    const result = await service.findAll({ skip: 0, take: 10 });
    expect(result.items).toHaveLength(1);
  });

  it('should get due jobs', async () => {
    prisma.publishJob.findMany.mockResolvedValueOnce([{ id: 'job-1' }]);
    const result = await service.getDueJobs(new Date(), 10);
    expect(result).toHaveLength(1);
  });

  it('claims a QUEUED job for execution and reports true', async () => {
    prisma.publishJob.updateMany.mockResolvedValueOnce({ count: 1 });
    const result = await service.markRunning('job-1');
    expect(result).toBe(true);
    expect(prisma.publishJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'job-1', status: { in: [JobStatus.QUEUED, JobStatus.RETRYING] } },
        data: expect.objectContaining({ status: JobStatus.RUNNING }),
      }),
    );
  });

  it('returns false when the job is no longer claimable', async () => {
    prisma.publishJob.updateMany.mockResolvedValueOnce({ count: 0 });
    const result = await service.markRunning('job-1');
    expect(result).toBe(false);
  });

  it('should mark job as completed', async () => {
    prisma.publishJob.update.mockResolvedValueOnce({ id: 'job-1', status: JobStatus.COMPLETED });
    const result = await service.markCompleted('job-1');
    expect(result.status).toBe(JobStatus.COMPLETED);
  });

  it('should mark job as failed', async () => {
    prisma.publishJob.update.mockResolvedValueOnce({ id: 'job-1', status: JobStatus.FAILED });
    const result = await service.markFailed('job-1', 'timeout');
    expect(result.status).toBe(JobStatus.FAILED);
  });
});
