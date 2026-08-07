import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { TeamService } from '../team/team.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

describe('AnalyticsController', () => {
  let controller: AnalyticsController;
  let service: any;
  let teamService: any;

  beforeEach(async () => {
    service = {
      getTeamDashboard: jest.fn().mockResolvedValue({}),
      getOverview: jest.fn().mockResolvedValue({}),
      getHistory: jest.fn().mockResolvedValue({ data: [] }),
      getTopContent: jest.fn().mockResolvedValue({ items: [] }),
      getAccountMetrics: jest.fn().mockResolvedValue({}),
      recordSnapshot: jest.fn().mockResolvedValue({ id: 'snap-1' }),
      getAvailableFields: jest.fn().mockResolvedValue({ categories: [] }),
      generateReport: jest.fn().mockResolvedValue({ fields: [], rows: [], totalCount: 0, generatedAt: '' }),
      saveReport: jest.fn().mockResolvedValue({ id: 'rpt-1' }),
      listReports: jest.fn().mockResolvedValue([]),
      getReport: jest.fn().mockResolvedValue({ id: 'rpt-1' }),
      deleteReport: jest.fn().mockResolvedValue({ success: true, deletedId: 'rpt-1' }),
    };
    teamService = {
      firstTeamForUser: jest.fn().mockResolvedValue('team-from-jwt'),
    };

    const module = await Test.createTestingModule({
      controllers: [AnalyticsController],
      providers: [
        { provide: AnalyticsService, useValue: service },
        { provide: TeamService, useValue: teamService },
      ],
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

  // ── Custom reports (PRD §3.5) ──────────────────────────────────────

  it('getReportFields delegates to service', async () => {
    await controller.getReportFields();
    expect(service.getAvailableFields).toHaveBeenCalledTimes(1);
  });

  it('generateReport forwards dto fields, filters, groupBy, sortBy, sortDir, limit', async () => {
    const dto = {
      fieldIds: ['impressions', 'likes'],
      filters: [{ field: 'platform', operator: 'eq', value: 'WECHAT_OFFICIAL' }],
      groupBy: 'platform',
      sortBy: 'impressions',
      sortDir: 'asc',
      limit: 50,
    };
    await controller.generateReport(dto as any);
    expect(service.generateReport).toHaveBeenCalledWith(
      dto.fieldIds,
      dto.filters,
      dto.groupBy,
      dto.sortBy,
      dto.sortDir,
      dto.limit,
    );
  });

  it('saveReport resolves team from JWT and delegates to service', async () => {
    const dto = { fieldIds: ['impressions'], name: 'Test report' };
    const user = { userId: 'user-1' };
    const result = await controller.saveReport(user as any, dto as any);
    expect(teamService.firstTeamForUser).toHaveBeenCalledWith('user-1');
    expect(service.saveReport).toHaveBeenCalledWith(
      'team-from-jwt',
      'user-1',
      { ...dto, name: 'Test report' },
    );
    expect(result).toEqual({ id: 'rpt-1' });
  });

  it('listReports resolves team from JWT and delegates to service', async () => {
    const user = { userId: 'user-1' };
    await controller.listReports(user as any);
    expect(teamService.firstTeamForUser).toHaveBeenCalledWith('user-1');
    expect(service.listReports).toHaveBeenCalledWith('team-from-jwt');
  });

  it('getReport delegates to service with the report id', async () => {
    await controller.getReport('rpt-1');
    expect(service.getReport).toHaveBeenCalledWith('rpt-1');
  });

  it('deleteReport delegates to service with the report id', async () => {
    const result = await controller.deleteReport('rpt-1');
    expect(service.deleteReport).toHaveBeenCalledWith('rpt-1');
    expect(result).toEqual({ success: true, deletedId: 'rpt-1' });
  });
});
