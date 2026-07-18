import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { Platform } from '@prisma/client';
import {
  JobStatus,
  Platform as P,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SchedulerService } from '../scheduler/scheduler.service';
import { EngagementService } from '../engagement/engagement.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { HealthService } from '../health/health.service';

export interface PublishJobPayload {
  contentId: string;
  platform: Platform | string;
  scheduledAt?: Date;
}

export interface PublishJobResult {
  processed: number;
  succeeded: number;
  failed: number;
}

export interface EngagementSyncResult {
  teams: number;
  comments: number;
  messages: number;
}

export interface AnomalyScanResult {
  accounts: number;
  anomalies: number;
  teamsAlerted: number;
}

export interface ThresholdScanResult {
  teams: number;
  alerts: number;
  teamsNotified: number;
}

/**
 * Queue seam. Backed today by Prisma polling (QueueKind='prisma'), shaped so that
 * a BullMQ/Redis implementation (QueueKind='bullmq') can drop in behind the
 * same method surface without touching the consumer (`worker.ts`):
 *
 *   publish / schedulePublish  → enqueue a publish job
 *   runPublishTick              → claim & execute due jobs (atomic via markRunning)
 *   runEngagementSyncTick       → ingest comments/messages for all active accounts
 *   runAnomalyScanTick          → scan series and alert teams
 *
 * The Prisma implementation materializes jobs as rows on `PublishJob` and reuses
 * SchedulerService's executeJob (which is already concurrency-safe). Every
 * method is unit-testable in isolation from the poll loop.
 */
export type QueueKind = 'prisma' | 'bullmq';

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scheduler: SchedulerService,
    private readonly engagement: EngagementService,
    private readonly analytics: AnalyticsService,
    private readonly health: HealthService,
    @Optional()
    @Inject('QUEUE_KIND')
    readonly kind: QueueKind = 'prisma',
  ) {}

  /** Enqueue — and immediately materialize — a publish job for a piece of content. */
  async publish(
    contentId: string,
    platform: P | string,
    scheduledAt: Date = new Date(),
  ) {
    return this.scheduler.schedule(contentId, platform, scheduledAt);
  }

  /** Alias that makes the enqueue intent explicit from call sites. */
  schedulePublish(payload: PublishJobPayload) {
    return this.publish(payload.contentId, payload.platform, payload.scheduledAt);
  }

  /**
   * Run one publish-processing tick: claim up to `limit` due jobs and execute
   * them. Each executeJob() is wrapped so a single failure does not abort the
   * whole tick.
   */
  async runPublishTick(now: Date = new Date(), limit = 10): Promise<PublishJobResult> {
    if (this.kind !== 'prisma') {
      // A real BullMQ implementation would spin up a Worker with a concurrency
      // limit and return its run summary. Seam reserved — see QueueKind='bullmq'.
      throw new Error(`Queue kind '${this.kind}' is wired to the Prisma seam only`);
    }

    const due = await this.scheduler.getDueJobs(now, limit);
    let succeeded = 0;
    let failed = 0;
    for (const job of due) {
      try {
        await this.scheduler.executeJob(job.id);
        succeeded++;
      } catch (err) {
        failed++;
        this.logger.warn(
          `Job ${job.id} failed in tick: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
    return { processed: due.length, succeeded, failed };
  }

  /** Run one engagement-ingest tick across every active account. */
  async runEngagementSyncTick(): Promise<EngagementSyncResult> {
    const summary = await this.engagement.syncAllTeams();
    return {
      teams: summary.length,
      comments: summary.reduce((acc, s) => acc + (s.comments ?? 0), 0),
      messages: summary.reduce((acc, s) => acc + (s.messages ?? 0), 0),
    };
  }

  /** Run one analytics anomaly scan across every active account. */
  async runAnomalyScanTick(): Promise<AnomalyScanResult> {
    const results = await this.analytics.scanAllAndAlert();
    return {
      accounts: results.length,
      anomalies: results.reduce((acc, r) => acc + (r.anomalies ?? 0), 0),
      teamsAlerted: results.filter((r) => r.notified).length,
    };
  }

  /** Run a threshold health scan across every team and notify teams below the threshold. */
  async runThresholdScanTick(): Promise<ThresholdScanResult> {
    const teams = await this.prisma.team.findMany({ select: { id: true } });
    let teamsNotified = 0;
    let alerts = 0;
    for (const team of teams) {
      try {
        const result = await this.health.checkThresholdAlerts(team.id, true);
        if (result.alerts.length > 0) {
          alerts += result.alerts.length;
          if (result.notified > 0) teamsNotified++;
        }
      } catch (err) {
        this.logger.warn(
          `Threshold scan failed for team ${team.id}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
    return { teams: teams.length, alerts, teamsNotified };
  }
}
