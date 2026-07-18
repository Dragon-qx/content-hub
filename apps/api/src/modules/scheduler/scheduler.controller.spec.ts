import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { SchedulerController } from './scheduler.controller';
import { SchedulerService } from './scheduler.service';
import { SchedulingRecommendationService } from './scheduling-recommendation.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PlatformSdkService } from '../platform-sdk/platform-sdk.service';

describe('SchedulerController', () => {
  let controller: SchedulerController;
  let service: any;
  let recommendations: any;

  beforeEach(async () => {
    service = {
      schedule: jest.fn().mockResolvedValue({ id: 'job-1', status: 'QUEUED' }),
      findAll: jest.fn().mockResolvedValue({ items: [], total: 0 }),
      findOne: jest.fn().mockResolvedValue({ id: 'job-1' }),
      cancel: jest.fn().mockResolvedValue({ id: 'job-1', status: 'CANCELLED' }),
      retry: jest.fn().mockResolvedValue({ id: 'job-1', status: 'QUEUED' }),
      executeJob: jest.fn().mockResolvedValue(undefined),
    };
    recommendations = {
      recommend: jest.fn().mockResolvedValue({ basis: 'heuristic', slots: [] }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SchedulerController],
      providers: [
        { provide: SchedulerService, useValue: service },
        { provide: SchedulingRecommendationService, useValue: recommendations },
        { provide: PrismaService, useValue: {} },
        { provide: PlatformSdkService, useValue: {} },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(SchedulerController);
    jest.clearAllMocks();
  });

  it('requires JwtAuthGuard', () => {
    const reflector = new Reflector();
    const guards = reflector.get('__guards__', SchedulerController);
    expect(guards).toContain(JwtAuthGuard);
  });

  it('schedule parses ISO scheduledAt into a Date', async () => {
    await controller.schedule({
      contentId: 'c1',
      platform: 'WECHAT_OFFICIAL' as any,
      scheduledAt: '2026-01-01T00:00:00.000Z',
    });
    expect(service.schedule).toHaveBeenCalledWith(
      'c1',
      'WECHAT_OFFICIAL',
      new Date('2026-01-01T00:00:00.000Z'),
    );
  });

  it('findAll forwards pagination', async () => {
    await controller.findAll({ skip: 5, take: 10 } as any);
    expect(service.findAll).toHaveBeenCalledWith({ skip: 5, take: 10 });
  });

  it('execute triggers job execution then returns the job', async () => {
    await controller.execute('job-1');
    expect(service.executeJob).toHaveBeenCalledWith('job-1');
    expect(service.findOne).toHaveBeenCalledWith('job-1');
  });

  it('getRecommendations delegates to SchedulingRecommendationService with parsed options', async () => {
    recommendations.recommend.mockResolvedValue({
      basis: 'historical',
      slots: [{ scheduledAt: '2026-07-10T19:00:00.000Z', score: 0.9 }],
      accountsConsidered: 3,
    });
    const query = { teamId: 'team-1', slots: 3 as any, horizonDays: 14 as any, accountId: undefined };
    await controller.getRecommendations(query);
    expect(recommendations.recommend).toHaveBeenCalledWith('team-1', {
      accountId: undefined,
      slots: 3,
      horizonDays: 14,
    });
  });
});
