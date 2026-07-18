import { Controller, Get, Header, Param, Post, Body, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AnalyticsQueryDto, HistoryQueryDto, TopContentQueryDto } from './dto/analytics-query.dto';
import { SnapshotCreateDto } from './dto/snapshot-create.dto';
import { AnomalyAlertsQueryDto, ScanAnomalyDto } from './dto/anomaly.dto';

@Controller('analytics')
@UseGuards(JwtAuthGuard)
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

  /** Export the history trend as CSV. */
  @Get('history/export')
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="analytics-history.csv"')
  async exportHistory(@Query() query: HistoryQueryDto, @Res() res: Response) {
    const { data } = await this.analytics.getHistory(query.metric, query.period);
    const header = 'date,value\n';
    const body = data.map((d) => `${d.date},${d.value}`).join('\n');
    return res.send(header + body);
  }

  /** 手动触发快照采集 */
  @Post('snapshot/:accountId')
  recordSnapshot(
    @Param('accountId') accountId: string,
    @Body() dto: SnapshotCreateDto,
  ) {
    return this.analytics.recordSnapshot(accountId, dto);
  }

  // ── Anomaly detection (PRD §3.5) ───────────────────────────────────────

  /** Detect anomalies for one account across all monitored metrics. */
  @Get('anomalies/:accountId')
  async getAnomalies(@Param('accountId') accountId: string) {
    const anomalies = await this.analytics.detectAccountAnomalies(accountId);
    return { accountId, anomalies, generatedAt: new Date().toISOString() };
  }

  /**
   * Trigger an on-demand scan. With no body or no accountId, scans every
   * active account; otherwise scans the one named account. Set notify:false to
   * suppress the team broadcast (useful for a dry preview).
   */
  @Post('anomalies/scan')
  async scanAnomalies(@Body() dto: ScanAnomalyDto) {
    if (dto.accountId) {
      const anomalies = await this.analytics.detectAccountAnomalies(
        dto.accountId,
      );
      let notified = false;
      if (dto.notify !== false && anomalies.length > 0) {
        const r = await this.analytics.scanAccountAndAlert(dto.accountId);
        notified = r.notified;
      }
      return {
        accountId: dto.accountId,
        anomalies,
        notified,
      };
    }

    const results = await this.analytics.scanAllAndAlert();
    return { scanned: results.length, results };
  }

  /** Recent anomaly alert broadcast records (for the audit surface). */
  @Get('anomaly-alerts')
  listAlerts(@Query() query: AnomalyAlertsQueryDto) {
    return this.analytics.listAlerts(query);
  }
}
