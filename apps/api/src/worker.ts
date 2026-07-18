import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { QueueService } from './modules/queue/queue.service';

const POLL_INTERVAL_MS = Number(process.env.WORKER_POLL_INTERVAL_MS ?? 10_000);
const BATCH_SIZE = Number(process.env.WORKER_BATCH_SIZE ?? 5);

/**
 * How often to refresh engagement inboxes (ingest comments for every active
 * account). Kept slower than the publish tick: comment polling touches more
 * accounts and is not latency-sensitive. Defaults to 10 minutes.
 */
const ENGAGEMENT_SYNC_INTERVAL_MS = Number(
  process.env.WORKER_ENGAGEMENT_SYNC_INTERVAL_MS ?? 600_000,
);

/**
 * How often to run the analytics anomaly scan over every active account.
 * Detection needs a meaningful time series, so this is intentionally slow —
 * a few times a day is plenty. Defaults to 6 hours.
 */
const ANOMALY_SCAN_INTERVAL_MS = Number(
  process.env.WORKER_ANOMALY_SCAN_INTERVAL_MS ?? 6 * 3_600_000,
);

/**
 * Standalone publish + engagement + anomaly worker.
 *
 * All dispatch goes through QueueService, a pluggable seam. Backed today by the
 * Prisma-backed implementation (job rows on `PublishJob`), with a reserved
 * `QueueKind='bullmq'` switch so a Redis-backed implementation can drop in
 * without touching this file. A single poll tick through the Prisma seam:
 *   1. runPublishTick — claims up to BATCH_SIZE due jobs (QUEUED/RETRYING with
 *      scheduledAt <= now) and executes them; markRunning atomically claims each
 *      job so concurrent workers never double-publish
 *   2. on a slower cadence, runEngagementSyncTick ingests fresh comments +
 *      messages for every active account
 *   3. on a yet slower cadence, runAnomalyScanTick scans every account's series
 *      and alerts teams when anomalies change
 *   4. sleep POLL_INTERVAL_MS, repeat
 *
 * Stops gracefully on SIGINT/SIGTERM.
 */
async function bootstrap() {
  const logger = new Logger('PublishWorker');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['warn', 'error'],
  });
  await app.init();

  const queue = app.get(QueueService);

  let running = true;
  let lastEngagementSync = 0;
  let lastAnomalyScan = 0;

  const shutdown = () => {
    logger.log('Received shutdown signal, finishing current tick...');
    running = false;
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  logger.log(
    `Publish worker started (poll ${POLL_INTERVAL_MS}ms, batch ${BATCH_SIZE}, ` +
      `queue=${queue.kind}, ` +
      `engagement sync every ${ENGAGEMENT_SYNC_INTERVAL_MS}ms, ` +
      `anomaly scan every ${ANOMALY_SCAN_INTERVAL_MS}ms)`,
  );

  // Negative setTimeout are clamped to 1 ms by Node, so toMs guards delay bounds.
  const toMs = (ms: number) => Math.max(1, ms);

  while (running) {
    try {
      const pub = await queue.runPublishTick(new Date(), BATCH_SIZE);
      if (pub.processed > 0) {
        logger.log(
          `Publish tick: processed ${pub.processed} job(s) — ` +
            `${pub.succeeded} ok / ${pub.failed} failed`,
        );
      }

      const now = Date.now();
      if (now - lastEngagementSync >= ENGAGEMENT_SYNC_INTERVAL_MS) {
        lastEngagementSync = now;
        try {
          const summary = await queue.runEngagementSyncTick();
          if (summary.comments > 0 || summary.messages > 0) {
            logger.log(
              `Engagement sync: ${summary.teams} team(s), ` +
                `${summary.comments} comment(s), ${summary.messages} message(s)`,
            );
          }
        } catch (err) {
          logger.warn(
            `Engagement sync failed: ${
              err instanceof Error ? err.message : err
            }`,
          );
        }
      }

      if (now - lastAnomalyScan >= ANOMALY_SCAN_INTERVAL_MS) {
        lastAnomalyScan = now;
        try {
          const results = await queue.runAnomalyScanTick();
          if (results.anomalies > 0 || results.teamsAlerted > 0) {
            logger.log(
              `Anomaly scan: ${results.accounts} account(s), ` +
                `${results.anomalies} anomaly(s), ${results.teamsAlerted} team(s) alerted`,
            );
          }
        } catch (err) {
          logger.warn(
            `Anomaly scan failed: ${
              err instanceof Error ? err.message : err
            }`,
          );
        }
      }
    } catch (err) {
      logger.error(
        `Poll tick failed: ${err instanceof Error ? err.message : err}`,
      );
    }

    if (!running) break;
    await new Promise((resolve) => setTimeout(resolve, toMs(POLL_INTERVAL_MS)));
  }

  logger.log('Publish worker stopping...');
  await app.close();
  process.exit(0);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Publish worker failed to start', err);
  process.exit(1);
});
