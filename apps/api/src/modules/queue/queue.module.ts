import { Module } from '@nestjs/common';
import { QueueService } from './queue.service';
import { SchedulerModule } from '../scheduler/scheduler.module';
import { EngagementModule } from '../engagement/engagement.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { HealthModule } from '../health/health.module';

@Module({
  imports: [SchedulerModule, EngagementModule, AnalyticsModule, HealthModule],
  providers: [
    QueueService,
    // Switch this provider to a BullMQ-backed QueueService to enable true
    // message-queue dispatch. The Prisma seam is the default so the app runs
    // without Redis.
    { provide: 'QUEUE_KIND', useValue: (process.env.QUEUE_KIND ?? 'prisma') as 'prisma' | 'bullmq' },
  ],
  exports: [QueueService],
})
export class QueueModule {}
