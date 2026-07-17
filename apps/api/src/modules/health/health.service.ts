import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AccountStatus, Platform, Prisma } from '@prisma/client';
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

/**
 * Computes account health purely from existing relations (lastSyncedAt,
 * publishJobs, stored credential expiry, status). No schema migration needed:
 * everything is derived, so it works against the current Prisma model.
 */
@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly notifications: NotificationService,
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

    return {
      accountId: account.id,
      accountName: account.accountName,
      platform: account.platform,
      status: account.status,
      health,
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
