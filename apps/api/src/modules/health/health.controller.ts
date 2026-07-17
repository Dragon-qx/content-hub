import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  AccountHealth,
  HealthService,
  TeamHealthSummary,
} from './health.service';
import { AccountIdParam, TeamIdParam } from './dto/health.dto';

/**
 * Account health monitoring (PRD §3.2). All computation is derived from
 * existing relations, so there is no persisted health state to keep in sync.
 *
 * Mounted under `health-monitor` to avoid colliding with the liveness probe
 * (`GET /api/v1/health`) on AppController.
 */
@Controller('health-monitor')
@UseGuards(JwtAuthGuard)
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  /** Evaluate a single account's health. */
  @Get('accounts/:id')
  getAccountHealth(
    @Param() { id }: AccountIdParam,
  ): Promise<AccountHealth> {
    return this.healthService.evaluateAccount(id);
  }

  /** Evaluate every account in a team and roll up status totals. */
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
  @Post('teams/:teamId/run')
  runTeamCheck(@Param() { teamId }: TeamIdParam) {
    return this.healthService.runTeamCheck(teamId);
  }
}
