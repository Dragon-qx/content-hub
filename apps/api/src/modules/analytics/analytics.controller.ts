import { Controller, Get, Param, Query } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('dashboard/:accountId') getDashboard(@Param('accountId') accountId: string, @Query() query: any) {
    return this.analytics.getDashboard(accountId, query);
  }
  @Get('account/:accountId') getAccountMetrics(@Param('accountId') accountId: string) {
    return this.analytics.getAccountMetrics(accountId);
  }
  @Get('account/:accountId/history') getHistorical(@Param('accountId') accountId: string, @Query('metric') metric: string, @Query('period') period: string) {
    return this.analytics.getHistorical(accountId, metric, period);
  }
}
