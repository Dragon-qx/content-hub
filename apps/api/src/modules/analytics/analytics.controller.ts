import { Controller, Get, Header, Param, Post, Body, Query, Res, UseGuards, Delete } from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AnalyticsQueryDto, HistoryQueryDto, TopContentQueryDto } from './dto/analytics-query.dto';
import { SnapshotCreateDto } from './dto/snapshot-create.dto';
import { AnomalyAlertsQueryDto, ScanAnomalyDto } from './dto/anomaly.dto';
import { ReportConfigDto } from './dto/report.dto';

@ApiTags('Analytics')
@ApiBearerAuth()
@Controller('analytics')
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  /** 团队数据总览（聚合所有账号） */
  @ApiOperation({ summary: 'Team dashboard', description: 'Aggregated metrics across all of the user\'s accounts.' })
  @Get('dashboard')
  getTeamDashboard() {
    return this.analytics.getTeamDashboard();
  }

  /** 核心指标（含环比对比） */
  @ApiOperation({ summary: 'Metric overview', description: 'Core metrics with period-over-period comparison.' })
  @Get('overview')
  getOverview(@Query() query: AnalyticsQueryDto) {
    return this.analytics.getOverview(query.days);
  }

  /** 历史趋势数据 */
  @ApiOperation({ summary: 'History trend', description: 'Time-series values for a chosen metric.' })
  @Get('history')
  getHistory(@Query() query: HistoryQueryDto) {
    return this.analytics.getHistory(query.metric, query.period);
  }

  /** 内容排行榜（Top / Bottom 自动标记，PRD §3.5） */
  @ApiOperation({ summary: 'Content ranking', description: 'Top / Bottom content by a chosen metric, with automatic tier marking.' })
  @Get('top-content')
  getTopContent(@Query() query: TopContentQueryDto) {
    return this.analytics.getTopContent(query.sortBy, query.limit, query.view ?? 'top');
  }

  /** 单账号核心指标 */
  @ApiOperation({ summary: 'Account metrics', description: 'Core metrics for a single account.' })
  @ApiParam({ name: 'accountId', description: 'Account id' })
  @Get('account/:accountId')
  getAccountMetrics(@Param('accountId') accountId: string) {
    return this.analytics.getAccountMetrics(accountId);
  }

  /** Export the history trend as CSV. */
  @ApiOperation({ summary: 'Export history as CSV', description: 'Downloads the filtered history trend as a CSV attachment.' })
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
  @ApiOperation({ summary: 'Record a metric snapshot', description: 'Persists a manual snapshot of account metrics for trending.' })
  @ApiParam({ name: 'accountId', description: 'Account id' })
  @Post('snapshot/:accountId')
  @ApiCreatedResponse({ description: 'Metric snapshot recorded.' })
  recordSnapshot(
    @Param('accountId') accountId: string,
    @Body() dto: SnapshotCreateDto,
  ) {
    return this.analytics.recordSnapshot(accountId, dto);
  }

  // ── Anomaly detection (PRD §3.5) ───────────────────────────────────────

  /** Detect anomalies for one account across all monitored metrics. */
  @ApiOperation({ summary: 'Detect anomalies for an account', description: 'Runs the 5-rule anomaly detector over an accounts recent metrics.' })
  @ApiParam({ name: 'accountId', description: 'Account id' })
  @Get('anomalies/:accountId')
  @ApiOkResponse({ description: 'Detected anomalies for the account.' })
  async getAnomalies(@Param('accountId') accountId: string) {
    const anomalies = await this.analytics.detectAccountAnomalies(accountId);
    return { accountId, anomalies, generatedAt: new Date().toISOString() };
  }

  /**
   * Trigger an on-demand scan. With no body or no accountId, scans every
   * active account; otherwise scans the one named account. Set notify:false to
   * suppress the team broadcast (useful for a dry preview).
   */
  @ApiOperation({ summary: 'Scan anomalies (one / all)', description: 'Runs the detector on demand. Optionally broadcasts alerts to the team.' })
  @Post('anomalies/scan')
  @ApiCreatedResponse({ description: 'Scan complete; lists anomalies (optionally broadcast).' })
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
  @ApiOperation({ summary: 'List anomaly alerts', description: 'Paginated list of anomaly-alert broadcast records.' })
  @Get('anomaly-alerts')
  listAlerts(@Query() query: AnomalyAlertsQueryDto) {
    return this.analytics.listAlerts(query);
  }

  // ── Custom drag-and-drop reports (PRD §3.5) ──────────────────────────

  /** Available fields for the report builder (grouped by category). */
  @ApiOperation({ summary: 'Report builder fields', description: 'Returns the draggable field list grouped by category for the custom report builder.' })
  @Get('report-fields')
  @ApiOkResponse({ description: 'Grouped available fields.' })
  getReportFields() {
    return this.analytics.getAvailableFields();
  }

  /** Generate a report from selected fields (one-off, not saved). */
  @ApiOperation({ summary: 'Generate a report', description: 'Generates report data from selected fields, filters, and grouping. Does not persist the configuration.' })
  @Post('reports/generate')
  @ApiOkResponse({ description: 'Generated report data.' })
  generateReport(@Body() dto: ReportConfigDto) {
    return this.analytics.generateReport(
      dto.fieldIds,
      dto.filters,
      dto.groupBy,
      dto.sortBy,
      dto.sortDir,
      dto.limit,
    );
  }

  /** Save (create or update) a named report configuration. */
  @ApiOperation({ summary: 'Save a report', description: 'Persists a custom report configuration for later reuse.' })
  @Post('reports')
  @ApiCreatedResponse({ description: 'Report saved.' })
  async saveReport(@Body() dto: ReportConfigDto) {
    // In a real app, userId/teamId come from the JWT. Use a placeholder for now.
    const teamId = 'default-team';
    const userId = 'system';
    return this.analytics.saveReport(teamId, userId, { ...dto, name: dto.name ?? 'Untitled report' });
  }

  /** List saved reports for the current team. */
  @ApiOperation({ summary: 'List saved reports', description: 'Returns all saved custom reports for the team.' })
  @Get('reports')
  @ApiOkResponse({ description: 'List of saved reports.' })
  listReports() {
    const teamId = 'default-team';
    return this.analytics.listReports(teamId);
  }

  /** Fetch one saved report configuration. */
  @ApiOperation({ summary: 'Get a saved report', description: 'Returns a single saved report configuration.' })
  @ApiParam({ name: 'id', description: 'Report id' })
  @Get('reports/:id')
  @ApiOkResponse({ description: 'Saved report.' })
  getReport(@Param('id') id: string) {
    return this.analytics.getReport(id);
  }

  /** Delete a saved report. */
  @ApiOperation({ summary: 'Delete a report', description: 'Permanently removes a saved custom report.' })
  @ApiParam({ name: 'id', description: 'Report id' })
  @Delete('reports/:id')
  @ApiOkResponse({ description: 'Report deleted.' })
  deleteReport(@Param('id') id: string) {
    return this.analytics.deleteReport(id);
  }
}
