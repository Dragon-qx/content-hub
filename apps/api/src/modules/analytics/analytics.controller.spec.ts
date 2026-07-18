import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

describe('AnalyticsController', () => {
  let controller: AnalyticsController;
  let service: any;

  beforeEach(async () => {
    service = {
      getTeamDashboard: jest.fn().mockResolvedValue({}),
      getOverview: jest.fn().mockResolvedValue({}),
      getHistory: jest.fn().mockResolvedValue({ data: [] }),
      getTopContent: jest.fn().mockResolvedValue({ items: [] }),
      getAccountMetrics: jest.fn().mockResolvedValue({}),
      recordSnapshot: jest.fn().mockResolvedValue({ id: 'snap-1' }),
    };

    const module = await Test.createTestingModule({
      controllers: [AnalyticsController],
      providers: [{ provide: AnalyticsService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(AnalyticsController);
    jest.clearAllMocks();
  });

  it('requires JwtAuthGuard', () => {
    const reflector = new Reflector();
    const guards = reflector.get('__guards__', AnalyticsController);
    expect(guards).toContain(JwtAuthGuard);
  });

  it('getOverview forwards days from the query', async () => {
    await controller.getOverview({ days: 14 } as any);
    expect(service.getOverview).toHaveBeenCalledWith(14);
  });

  it('getHistory forwards metric and period from the query', async () => {
    await controller.getHistory({ metric: 'impressions', period: '30d' } as any);
    expect(service.getHistory).toHaveBeenCalledWith('impressions', '30d');
  });

  it('getTopContent forwards sortBy, limit and view from the query', async () => {
    await controller.getTopContent({ sortBy: 'likes', limit: 5, view: 'bottom' } as any);
    expect(service.getTopContent).toHaveBeenCalledWith('likes', 5, 'bottom');
  });

  it('getTopContent defaults view to top when omitted', async () => {
    await controller.getTopContent({ sortBy: 'likes', limit: 5 } as any);
    expect(service.getTopContent).toHaveBeenCalledWith('likes', 5, 'top');
  });
});
