import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SchedulerService } from './modules/scheduler/scheduler.service';
import { EngagementService } from './modules/engagement/engagement.service';

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
 * Standalone publish + engagement worker.
 *
 * Prisma queuing has no BullMQ/Redis dependency in this environment, so the
 * worker polls PublishJob for due (QUEUED / RETRYING) rows and executes them
 * through SchedulerService. A single poll tick:
 *   1. fetch up to BATCH_SIZE due jobs (scheduledAt <= now, buffered into the
 *      past by GRACE_MS to avoid racing just-scheduled jobs)
 *   2. execute each job (concurrency-safe on status)
 *   3. on a slower cadence, ingest fresh comments for every active account
 *   4. sleep POLL_INTERVAL_MS, repeat.
 *
 * Stops gracefully on SIGINT/SIGTERM (enableShutdownHooks in main).
 */
async function bootstrap() {
  const logger = new Logger('PublishWorker');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['warn', 'error'],
  });
  await app.init();

  const scheduler = app.get(SchedulerService);
  const engagement = app.get(EngagementService);

  let running = true;
  let lastEngagementSync = 0;

  const shutdown = () => {
    logger.log('Received shutdown signal, finishing current tick...');
    running = false;
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  logger.log(
    `Publish worker started (poll ${POLL_INTERVAL_MS}ms, batch ${BATCH_SIZE}, ` +
      `engagement sync every ${ENGAGEMENT_SYNC_INTERVAL_MS}ms)`,
  );

  while (running) {
    try {
      const due = await scheduler.getDueJobs(new Date(), BATCH_SIZE);
      if (due.length > 0) {
        logger.log(`Processing ${due.length} due job(s)`);
      }
      for (const job of due) {
        if (!running) break;
        try {
          await scheduler.executeJob(job.id);
        } catch (err) {
          logger.error(
            `Job ${job.id} execution error: ${err instanceof Error ? err.message : err}`,
          );
        }
      }

      // Slower-cadence engagement sync: ingest comments for all active
      // accounts. Uses a simple elapsed-Time comparison rather thancron;
      // Date.now() here is fine — it's wall-clock scheduling, not data.
      const now = Date.now();
      if (now - lastEngagementSync >= ENGAGEMENT_SYNC_INTERVAL_MS) {
        lastEngagementSync = now;
        try {
          const summary = await engagement.syncAllTeams();
          const totalComments = summary.reduce((acc, s) => acc + s.comments, 0);
          const totalMessages = summary.reduce((acc, s) => acc + s.messages, 0);
          if (totalComments > 0 || totalMessages > 0) {
            logger.log(
              `Engagement sync: ${summary.length} team(s), ` +
                `${totalComments} comment(s), ${totalMessages} message(s)`,
            );
          }
        } catch (err) {
          logger.warn(
            `Engagement sync failed: ${err instanceof Error ? err.message : err}`,
          );
        }
      }
    } catch (err) {
      logger.error(`Poll tick failed: ${err instanceof Error ? err.message : err}`);
    }

    if (!running) break;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
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
