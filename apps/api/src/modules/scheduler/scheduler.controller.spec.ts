import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { SchedulerController } from './scheduler.controller';
import { SchedulerService } from './scheduler.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PrismaService } from '../../common/prisma/prisma.service';

describe('SchedulerController', () => {
  let controller: SchedulerController;
  let service: any;

  beforeEach(async () => {
    service = {
      schedule: jest.fn().mockResolvedValue({ id: 'job-1', status: 'QUEUED' }),
      findAll: jest.fn().mockResolvedValue({ items: [], total: 0 }),
      findOne: jest.fn().mockResolvedValue({ id: 'job-1' }),
      cancel: jest.fn().mockResolvedValue({ id: 'job-1', status: 'CANCELLED' }),
      retry: jest.fn().mockResolvedValue({ id: 'job-1', status: 'QUEUED' }),
    };

    const module = await Test.createTestingModule({
      controllers: [SchedulerController],
      providers: [
        { provide: SchedulerService, useValue: service },
        { provide: PrismaService, useValue: {} },
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
      platform: 'TWITTER' as any,
      scheduledAt: '2026-01-01T00:00:00.000Z',
    });
    expect(service.schedule).toHaveBeenCalledWith(
      'c1',
      'TWITTER',
      new Date('2026-01-01T00:00:00.000Z'),
    );
  });

  it('findAll forwards pagination', async () => {
    await controller.findAll({ skip: 5, take: 10 } as any);
    expect(service.findAll).toHaveBeenCalledWith({ skip: 5, take: 10 });
  });
});
