import { Controller, Get, Param, Post, Body, Query } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { AnalyticsQueryDto, HistoryQueryDto, TopContentQueryDto } from './dto/analytics-query.dto';
import { SnapshotCreateDto } from './dto/snapshot-create.dto';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  /** 团队数据总览（聚合所有账号） */
  @Get('dashboard')
  getTeamDashboard() {
    return this.analytics.getTeamDashboard();
  }

  /** 核心指标（含环比对比） */
  @Get('overview')
  getOverview(@Query() query: AnalyticsQueryDto) {
    return this.analytics.getOverview(query.days);
  }

  /** 历史趋势数据 */
  @Get('history')
  getHistory(@Query() query: HistoryQueryDto) {
    return this.analytics.getHistory(query.metric, query.period);
  }

  /** 热门内容榜 */
  @Get('top-content')
  getTopContent(@Query() query: TopContentQueryDto) {
    return this.analytics.getTopContent(query.sortBy, query.limit);
  }

  /** 单账号核心指标 */
  @Get('account/:accountId')
  getAccountMetrics(@Param('accountId') accountId: string) {
    return this.analytics.getAccountMetrics(accountId);
  }

  /** 手动触发快照采集 */
  @Post('snapshot/:accountId')
  recordSnapshot(
    @Param('accountId') accountId: string,
    @Body() dto: SnapshotCreateDto,
  ) {
    return this.analytics.recordSnapshot(accountId, dto);
  }
}
