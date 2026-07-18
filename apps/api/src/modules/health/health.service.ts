import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AccountStatus, Platform, Prisma } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CryptoService } from '../../common/crypto/crypto.service';
import { NotificationService } from '../notification/notification.service';

/** Overall health of an account — derived from its signals. */
export type HealthStatus = 'HEALTHY' | 'WARNING' | 'CRITICAL';

/** A single detectable condition contributing to an account's health. */
export type HealthSignal =
  | 'TOKEN_EXPIRES_SOON'
  | 'TOKEN_EXPIRED'
  | 'API_LIMIT_HIGH'
  | 'STALE_DATA'
  | 'RECENT_PUBLISH_FAILURES'
  | 'CONSECUTIVE_FAILURES'
  | 'ACCOUNT_INACTIVE';

export type HealthSignalSeverity = 'warning' | 'critical';

export interface SignalDiagnostic {
  signal: HealthSignal;
  severity: HealthSignalSeverity;
  message: string;
}

export interface AccountHealth {
  accountId: string;
  accountName: string;
  platform: Platform;
  status: AccountStatus;
  health: HealthStatus;
  score: number;
  signals: SignalDiagnostic[];
  lastSyncedAt?: string | null;
  tokenExpiresAt?: string | null;
  evaluatedAt: string;
}

export interface TeamHealthSummary {
  teamId: string;
  evaluatedAt: string;
  totals: { total: number; healthy: number; warning: number; critical: number };
  accounts: AccountHealth[];
}

/**
 * Threshold configuration for health-score alerts (PRD §3.2). Env-tunable.
 * `critical` < `warning`: score < critical → CRITICAL alert; score < warning →
 * WARNING alert; score >= warning → HEALTHY (no alert).
 */
export interface HealthThresholdConfig {
  critical: number;
  warning: number;
}

/**
 * A single threshold alert generated when an account's health score drops
 * below the team's configured warning or critical level.
 */
export interface ThresholdAlert {
  accountId: string;
  accountName: string;
  platform: Platform;
  score: number;
  level: HealthStatus;
  signals: SignalDiagnostic[];
  evaluatedAt: string;
}

/**
 * Result of a threshold-sweep across a team: the list of active alerts plus
 * the threshold levels that were applied.
 */
export interface ThresholdAlertResult {
  teamId: string;
  evaluatedAt: string;
  config: HealthThresholdConfig;
  alerts: ThresholdAlert[];
  notified: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How close (in days) a token's expiry must be before it is flagged as
 * "expiring soon". PRD §3.2: "Token 有效期剩余 < 7 天 → ⚠️ 预警".
 */
const TOKEN_EXPIRY_WARNING_DAYS = 7;

/**
 * An account is considered to have stale data when it has not synced within
 * this many days. PRD §3.2: "近 7 天无数据更新 → ⚠️ 预警".
 */
const STALE_DATA_DAYS = 7;

/**
 * Consecutive publish failures at/above this count are a critical alert.
 * PRD §3.2: "账号验证失败 > 3 次 → 🔴 告警".
 */
const CONSECUTIVE_FAILURES_CRITICAL = 3;

/** Per-signal score deductions used to compute a 0-100 health score. */
const SCORE_DEDUCTION_WARNING = 10;
const SCORE_DEDUCTION_CRITICAL = 25;

/**
 * Computes account health purely from existing relations (lastSyncedAt,
 * publishJobs, stored credential expiry, status). No schema migration needed:
 * everything is derived, so it works against the current Prisma model.
 */
@Injectable()
export class HealthService {
 private readonly logger = new Logger(HealthService.name);

  /** Process-wide in-memory override of threshold config (PATCH endpoint). */
  private thresholdOverride?: HealthThresholdConfig;

  /** Team-scoped in-memory overrides keyed by teamId. */
  private teamThresholdOverrides = new Map<string, HealthThresholdConfig>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly notifications: NotificationService,
    private readonly config: ConfigService,
  ) {}

  /** Decrypt stored credentials into a plain object (mirrors AccountService). */
  private decryptCredentials(
    raw: Prisma.JsonValue | null,
  ): Record<string, unknown> {
    if (!raw || typeof raw !== 'string') {
      return (raw as unknown as Record<string, unknown>) ?? {};
    }
    try {
      return this.crypto.decrypt<Record<string, unknown>>(raw);
    } catch {
      // Legacy/unencrypted records stored as plain JSON — return as-is.
      return (raw as unknown as Record<string, unknown>) ?? {};
    }
  }

  /**
   * Evaluate a single account's health. Throws NotFoundException when the
   * account does not exist.
   */
  async evaluateAccount(accountId: string): Promise<AccountHealth> {
    const account = await this.prisma.socialAccount.findUnique({
      where: { id: accountId },
    });
    if (!account) {
      throw new NotFoundException('Account not found');
    }

    return this.evaluate(account, new Date());
  }

  /**
   * Run health evaluation across every account in a team and return a summary
   * with per-status totals.
   */
  async evaluateTeam(teamId: string): Promise<TeamHealthSummary> {
    const accounts = await this.prisma.socialAccount.findMany({
      where: { teamId },
      orderBy: { createdAt: 'desc' },
    });

    const evaluatedAt = new Date();
    const healthOfAccounts = await Promise.all(
      accounts.map((a) => this.evaluate(a, evaluatedAt)),
    );

    const totals = { total: accounts.length, healthy: 0, warning: 0, critical: 0 };
    for (const h of healthOfAccounts) {
      if (h.health === 'HEALTHY') totals.healthy++;
      else if (h.health === 'WARNING') totals.warning++;
      else totals.critical++;
    }

    return {
      teamId,
      evaluatedAt: evaluatedAt.toISOString(),
      totals,
      accounts: healthOfAccounts,
    };
  }

  /**
   * Run a team-wide check and, for every account that is not HEALTHY, broadcast
   * an in-app notification to the whole team (PRD §3.2 notification channel:
   * 站内消息). Returns the summary plus the count of accounts notified about.
   */
  async runTeamCheck(
    teamId: string,
    notify = true,
  ): Promise<{ summary: TeamHealthSummary; notified: number }> {
    const summary = await this.evaluateTeam(teamId);

    if (!notify) {
      return { summary, notified: 0 };
    }

    const degraded = summary.accounts.filter((a) => a.health !== 'HEALTHY');
    if (degraded.length === 0) {
      return { summary, notified: 0 };
    }

    const critical = degraded.filter((a) => a.health === 'CRITICAL');
    const listing = degraded
      .map((a) => `${a.accountName} (${a.signals.map((s) => s.message).join(', ')})`)
      .join('; ');

    await this.notifications.broadcastToTeam(teamId, {
      type: critical.length > 0 ? 'error' : 'warning',
      title:
        critical.length > 0
          ? `${critical.length} account(s) in critical health`
          : `${degraded.length} account(s) need attention`,
      body: listing,
      metadata: {
        teamId,
        totals: summary.totals,
        accountIds: degraded.map((a) => a.accountId),
      },
    });

    this.logger.log(
      `Health check for team ${teamId}: ${degraded.length} degraded account(s) notified`,
    );

    return { summary, notified: degraded.length };
  }

  // ── Score + threshold alerts (M30c, PRD §3.2) ──────────────────────────

  /**
   * Compute a 0–100 health score from the account's signals. Pure: each
   * warning deducts {@link SCORE_DEDUCTION_WARNING}, each critical deducts
   * {@link SCORE_DEDUCTION_CRITICAL}; result is clamped to [0, 100].
   */
  computeScore(signals: SignalDiagnostic[]): number {
    let score = 100;
    for (const s of signals) {
      score -= s.severity === 'critical'
        ? SCORE_DEDUCTION_CRITICAL
        : SCORE_DEDUCTION_WARNING;
    }
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Read the configured threshold levels from the environment. PRD §3.2
   * default: critical < 40, warning < 65. Both are env-tunable:
   *   HEALTH_CRITICAL_THRESHOLD (default 40)
   *   HEALTH_WARNING_THRESHOLD (default 65)
   *
   * A process-wide override installed via {@link setThresholdConfig}
   * takes precedence; a team-specific override installed via
   * {@link setTeamThresholdConfig} further overrides for that team.
   */
  getThresholdConfig(teamId?: string): HealthThresholdConfig {
    const criticalEnv = Number(
      this.config.get('HEALTH_CRITICAL_THRESHOLD', 40),
    );
    const warningEnv = Number(
      this.config.get('HEALTH_WARNING_THRESHOLD', 65),
    );
    let critical = criticalEnv;
    let warning = warningEnv;
    if (this.thresholdOverride) {
      if (this.thresholdOverride.critical !== undefined) critical = this.thresholdOverride.critical;
      if (this.thresholdOverride.warning !== undefined) warning = this.thresholdOverride.warning;
    }
    if (teamId && this.teamThresholdOverrides.has(teamId)) {
      const ov = this.teamThresholdOverrides.get(teamId)!;
      if (ov.critical !== undefined) critical = ov.critical;
      if (ov.warning !== undefined) warning = ov.warning;
    }
    return { critical, warning };
  }

  /**
   * Install a process-wide threshold override. Fields left undefined fall
   * back to the previous layer (env). Returns the effective config for
   * confirmation.
   */
  setThresholdConfig(dto: { critical?: number; warning?: number }): HealthThresholdConfig {
    const prev = this.getThresholdConfig();
    this.thresholdOverride = {
      critical: dto.critical ?? prev.critical,
      warning: dto.warning ?? prev.warning,
    };
    return this.getThresholdConfig();
  }

  /**
   * Install a team-scoped threshold override. Fields left undefined fall
   * back to the previous layer (env / process-wide). Returns the effective
   * config for confirmation.
   */
  setTeamThresholdConfig(
    teamId: string,
    dto: { critical?: number; warning?: number },
  ): HealthThresholdConfig {
    const prev = this.teamThresholdOverrides.get(teamId) ?? { critical: 0, warning: 0 };
    this.teamThresholdOverrides.set(teamId, {
      critical: dto.critical ?? prev.critical,
      warning: dto.warning ?? prev.warning,
    });
    return this.getThresholdConfig(teamId);
  }

  /**
   * Map a health score to an alert level using the supplied (or configured)
   * thresholds. Pure.
   */
  scoreToLevel(
    score: number,
    config: HealthThresholdConfig = this.getThresholdConfig(),
  ): HealthStatus {
    if (score < config.critical) return 'CRITICAL';
    if (score < config.warning) return 'WARNING';
    return 'HEALTHY';
  }

  /**
   * Evaluate every account in a team, compute scores, and return only the
   * accounts whose score falls below the warning threshold — the raw
   * threshold alerts, without sending any notification.
   */
  async listActiveAlerts(
    teamId: string,
    config: HealthThresholdConfig = this.getThresholdConfig(teamId),
  ): Promise<ThresholdAlert[]> {
    const summary = await this.evaluateTeam(teamId);
    const alerts: ThresholdAlert[] = [];

    for (const account of summary.accounts) {
      const level = this.scoreToLevel(account.score, config);
      if (level === 'HEALTHY') continue;
      alerts.push({
        accountId: account.accountId,
        accountName: account.accountName,
        platform: account.platform,
        score: account.score,
        level,
        signals: account.signals,
        evaluatedAt: account.evaluatedAt,
      });
    }

    return alerts;
  }

  /**
   * Sweep every account in a team for threshold breaches and, when any are
   * found, broadcast an in-app notification to the whole team. Returns the
   * sweep result plus the count of newly created notification rows.
   *
   * The broadcast is fired once per sweep (not per account), so a team
   * crossing the threshold on N accounts receives a single summary message.
   */
  async checkThresholdAlerts(
    teamId: string,
    notify = true,
    config: HealthThresholdConfig = this.getThresholdConfig(teamId),
  ): Promise<ThresholdAlertResult> {
    const evaluatedAt = new Date().toISOString();
    const alerts = await this.listActiveAlerts(teamId, config);

    let notified = 0;
    if (notify && alerts.length > 0) {
      const criticalAlerts = alerts.filter((a) => a.level === 'CRITICAL');
      const summary = alerts
        .map(
          (a) =>
            `${a.accountName} (score ${a.score}): ${a.signals
              .map((s) => s.message)
              .join(', ') || 'no specific signal'}`,
        )
        .join('; ');

      await this.notifications.broadcastToTeam(teamId, {
        type: criticalAlerts.length > 0 ? 'error' : 'warning',
        title:
          criticalAlerts.length > 0
            ? `${criticalAlerts.length} account(s) in critical health (score < ${config.critical})`
            : `${alerts.length} account(s) below health threshold (score < ${config.warning})`,
        body: summary,
        metadata: JSON.stringify({
          teamId,
          config,
          alertCount: alerts.length,
          criticalCount: criticalAlerts.length,
          warningCount: alerts.length - criticalAlerts.length,
          accountIds: alerts.map((a) => a.accountId),
        }),
      });
      notified = alerts.length;

      this.logger.log(
        `Threshold sweep team ${teamId}: ${alerts.length} alert(s) ` +
          `(${criticalAlerts.length} critical, ${
            alerts.length - criticalAlerts.length
          } warning) notified`,
      );
    }

    return { teamId, evaluatedAt, config, alerts, notified };
  }

  /**
   * Core evaluation logic. Pure with respect to `now` so tests can pin the
   * clock. Reusable for single-account and team paths.
   */
  private async evaluate(
    account: {
      id: string;
      platform: Platform;
      accountName: string;
      status: AccountStatus;
      lastSyncedAt: Date | null;
      credentials: Prisma.JsonValue;
    },
    now: Date,
  ): Promise<AccountHealth> {
    const signals: SignalDiagnostic[] = [];

    // 1. Credential token expiry (OAuth adapters store expiresAt in creds).
    const creds = this.decryptCredentials(account.credentials);
    const tokenExpiresAt = this.parseExpiresAt(creds.expiresAt);
    if (tokenExpiresAt) {
      const daysUntilExpiry =
        (tokenExpiresAt.getTime() - now.getTime()) / DAY_MS;
      if (daysUntilExpiry <= 0) {
        signals.push({
          signal: 'TOKEN_EXPIRED',
          severity: 'critical',
          message: `Token expired ${Math.abs(Math.round(daysUntilExpiry))} day(s) ago`,
        });
      } else if (daysUntilExpiry < TOKEN_EXPIRY_WARNING_DAYS) {
        signals.push({
          signal: 'TOKEN_EXPIRES_SOON',
          severity: 'warning',
          message: `Token expires in ${Math.ceil(daysUntilExpiry)} day(s)`,
        });
      }
    }

    // 2. API rate-limit proximity, when the adapter records it.
    const rateLimit = creds.rateLimitRemaining;
    const rateLimitTotal = creds.rateLimitTotal;
    if (
      typeof rateLimit === 'number' &&
      typeof rateLimitTotal === 'number' &&
      rateLimitTotal > 0
    ) {
      const usedFraction = 1 - rateLimit / rateLimitTotal;
      if (usedFraction >= 0.8) {
        signals.push({
          signal: 'API_LIMIT_HIGH',
          severity: 'warning',
          message: `API quota ${Math.round(usedFraction * 100)}% consumed`,
        });
      }
    }

    // 3. Stale data: no successful sync within the window.
    const lastSync = account.lastSyncedAt;
    if (!lastSync) {
      signals.push({
        signal: 'STALE_DATA',
        severity: 'warning',
        message: 'Account has never synced',
      });
    } else {
      const daysSinceSync = (now.getTime() - lastSync.getTime()) / DAY_MS;
      if (daysSinceSync >= STALE_DATA_DAYS) {
        signals.push({
          signal: 'STALE_DATA',
          severity: 'warning',
          message: `No data sync in ${Math.round(daysSinceSync)} day(s)`,
        });
      }
    }

    // 4. Publish-failure history on this account.
    const consecutiveFailures = await this.prisma.publishJob.count({
      where: { accountId: account.id, status: 'FAILED' },
    });
    if (consecutiveFailures >= CONSECUTIVE_FAILURES_CRITICAL) {
      signals.push({
        signal: 'CONSECUTIVE_FAILURES',
        severity: 'critical',
        message: `${consecutiveFailures} consecutive publish failures`,
      });
    } else if (consecutiveFailures > 0) {
      signals.push({
        signal: 'RECENT_PUBLISH_FAILURES',
        severity: 'warning',
        message: `${consecutiveFailures} recent publish failure(s)`,
      });
    }

    // 5. Account suspended/revoked/expired on our side.
    if (account.status !== AccountStatus.ACTIVE) {
      signals.push({
        signal: 'ACCOUNT_INACTIVE',
        severity: 'critical',
        message: `Account status is ${account.status}`,
      });
    }

    const health = this.rollup(signals);
    const score = this.computeScore(signals);

    return {
      accountId: account.id,
      accountName: account.accountName,
      platform: account.platform,
      status: account.status,
      health,
      score,
      signals,
      lastSyncedAt: account.lastSyncedAt?.toISOString() ?? null,
      tokenExpiresAt: tokenExpiresAt?.toISOString() ?? null,
      evaluatedAt: now.toISOString(),
    };
  }

  /** Collapse a set of signal diagnostics into a single status. */
  private rollup(signals: SignalDiagnostic[]): HealthStatus {
    if (signals.some((s) => s.severity === 'critical')) return 'CRITICAL';
    if (signals.some((s) => s.severity === 'warning')) return 'WARNING';
    return 'HEALTHY';
  }

  /** Parse a credential expiresAt (ISO string, epoch ms, or Date) to a Date. */
  private parseExpiresAt(raw: unknown): Date | null {
    if (raw == null) return null;
    if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw;
    if (typeof raw === 'number') {
      // Treat small numbers as seconds-since-epoch, large as ms.
      const ms = raw < 1e12 ? raw * 1000 : raw;
      const d = new Date(ms);
      return isNaN(d.getTime()) ? null : d;
    }
    if (typeof raw === 'string') {
      const d = new Date(raw);
      return isNaN(d.getTime()) ? null : d;
    }
    return null;
  }
}
