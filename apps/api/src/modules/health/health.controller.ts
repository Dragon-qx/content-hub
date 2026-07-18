import { Body, Controller, Get, Param, Post, Patch, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  AccountHealth,
  HealthService,
  TeamHealthSummary,
  ThresholdAlertResult,
  HealthThresholdConfig,
} from './health.service';
import { AccountIdParam, TeamIdParam, ThresholdConfigDto } from './dto/health.dto';

/**
 * Account health monitoring (PRD §3.2). All computation is derived from
 * existing relations, so there is no persisted health state to keep in sync.
 *
 * Mounted under `health-monitor` to avoid colliding with the liveness probe
 * (`GET /api/v1/health`) on AppController.
 */
@ApiTags('Health Monitor')
@ApiBearerAuth()
@Controller('health-monitor')
@UseGuards(JwtAuthGuard)
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  /** Evaluate a single account's health. */
  @ApiOperation({ summary: 'Account health', description: 'Evaluates a single account as HEALTHY / WARNING / CRITICAL from its signals.' })
  @ApiParam({ name: 'id', description: 'Account id' })
  @ApiOkResponse({ description: 'Account health evaluation.' })
  @Get('accounts/:id')
  getAccountHealth(
    @Param() { id }: AccountIdParam,
  ): Promise<AccountHealth> {
    return this.healthService.evaluateAccount(id);
  }

  /** Evaluate every account in a team and roll up status totals. */
  @ApiOperation({ summary: 'Team health', description: 'Evaluates every account in a team and rolls up status totals.' })
  @ApiParam({ name: 'teamId', description: 'Team id' })
  @ApiOkResponse({ description: 'Team health summary.' })
  @Get('teams/:teamId')
  getTeamHealth(
    @Param() { teamId }: TeamIdParam,
  ): Promise<TeamHealthSummary> {
    return this.healthService.evaluateTeam(teamId);
  }

  /**
   * Run a team-wide check and broadcast an in-app notification to the team for
   * every degraded account (PRD §3.2 通知方式: 站内消息). The GET endpoints
   * above are read-only; this is the active trigger that surfaces problems.
   */
  @ApiOperation({ summary: 'Run team health check', description: 'Evaluates the team and broadcasts alerts for degraded accounts.' })
  @ApiParam({ name: 'teamId', description: 'Team id' })
  @Post('teams/:teamId/run')
  runTeamCheck(@Param() { teamId }: TeamIdParam) {
    return this.healthService.runTeamCheck(teamId);
  }

  /**
   * Return the current threshold alerts for a team — accounts whose health
   * score has fallen below the configured warning or critical level.
   */
  @ApiOperation({ summary: 'List active threshold alerts', description: 'Returns accounts whose health score is below the configured threshold.' })
  @ApiParam({ name: 'teamId', description: 'Team id' })
  @Get('teams/:teamId/alerts')
  listAlerts(@Param() { teamId }: TeamIdParam): Promise<ThresholdAlertResult> {
    return this.healthService.checkThresholdAlerts(teamId, false);
  }

  /**
   * Manually trigger the threshold sweep for a team and broadcast an in-app
   * notification to the whole team when any account is below threshold.
   */
  @ApiOperation({ summary: 'Run threshold sweep', description: 'Evaluates the team, broadcasts alerts for accounts below threshold, and returns the sweep result.' })
  @ApiParam({ name: 'teamId', description: 'Team id' })
  @Post('teams/:teamId/threshold-check')
  runThresholdCheck(@Param() { teamId }: TeamIdParam): Promise<ThresholdAlertResult> {
    return this.healthService.checkThresholdAlerts(teamId, true);
  }

  /**
   * Override the threshold config for this worker's lifecycle. When omitted,
   * falls back to the env defaults (HEALTH_CRITICAL_THRESHOLD,
   * HEALTH_WARNING_THRESHOLD). Returns the effective config.
   */
  @ApiOperation({ summary: 'Override threshold config', description: 'Update the critical/warning threshold levels for this worker (team-scoped).' })
  @ApiParam({ name: 'teamId', description: 'Team id' })
  @Patch('teams/:teamId/threshold-config')
  updateThresholdConfig(
    @Param() { teamId }: TeamIdParam,
    @Body() dto: ThresholdConfigDto,
  ): HealthThresholdConfig {
    return this.healthService.setTeamThresholdConfig(teamId, dto);
  }
}
