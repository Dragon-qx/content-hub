import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { PrismaService } from '../../common/prisma/prisma.service';

describe('SchedulerService', () => {
  let service: SchedulerService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      content: { findUnique: jest.fn() },
      publishJob: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
      },
    };

    const module = await Test.createTestingModule({
      providers: [SchedulerService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(SchedulerService);
    jest.clearAllMocks();
  });

  it('should schedule a job', async () => {
    prisma.content.findUnique.mockResolvedValue({ id: 'c1' });
    prisma.publishJob.create.mockResolvedValue({ id: 'job-1', status: 'QUEUED', scheduledAt: new Date() });

    const result = await service.schedule('c1', 'TWITTER', new Date('2026-01-01'));
    expect(result.status).toBe('QUEUED');
  });

  it('should reject schedule for missing content', async () => {
    prisma.content.findUnique.mockResolvedValue(null);
    await expect(service.schedule('bad', 'TWITTER', new Date())).rejects.toThrow(NotFoundException);
  });

  it('should cancel a job', async () => {
    prisma.publishJob.findUnique.mockResolvedValue({ id: 'job-1', status: 'QUEUED' });
    prisma.publishJob.update.mockResolvedValue({ id: 'job-1', status: 'CANCELLED' });

    const result = await service.cancel('job-1');
    expect(result.status).toBe('CANCELLED');
  });

  it('should reject cancel for missing job', async () => {
    prisma.publishJob.findUnique.mockResolvedValue(null);
    await expect(service.cancel('bad')).rejects.toThrow(NotFoundException);
  });

  it('should retry a failed job', async () => {
    prisma.publishJob.findUnique.mockResolvedValue({ id: 'job-1', status: 'FAILED' });
    prisma.publishJob.update.mockResolvedValue({ id: 'job-1', status: 'QUEUED', retryCount: 1 });

    const result = await service.retry('job-1');
    expect(result.status).toBe('QUEUED');
  });

  it('should list jobs with pagination', async () => {
    prisma.publishJob.findMany.mockResolvedValue([{ id: 'job-1' }]);
    prisma.publishJob.count.mockResolvedValue(1);

    const result = await service.findAll({ skip: 0, take: 10 });
    expect(result.items).toHaveLength(1);
  });

  it('should get due jobs', async () => {
    prisma.publishJob.findMany.mockResolvedValue([{ id: 'job-1' }]);

    const result = await service.getDueJobs(10);
    expect(result).toHaveLength(1);
  });

  it('should mark job as running', async () => {
    prisma.publishJob.update.mockResolvedValue({ id: 'job-1', status: 'RUNNING' });

    const result = await service.markRunning('job-1');
    expect(result.status).toBe('RUNNING');
  });

  it('should mark job as completed', async () => {
    prisma.publishJob.update.mockResolvedValue({ id: 'job-1', status: 'COMPLETED' });

    const result = await service.markCompleted('job-1');
    expect(result.status).toBe('COMPLETED');
  });

  it('should mark job as failed', async () => {
    prisma.publishJob.update.mockResolvedValue({ id: 'job-1', status: 'FAILED' });

    const result = await service.markFailed('job-1', 'timeout');
    expect(result.status).toBe('FAILED');
  });
});
