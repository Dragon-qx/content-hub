import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CryptoModule } from './common/crypto/crypto.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { AccountModule } from './modules/account/account.module';
import { AdaptationModule } from './modules/adaptation/adaptation.module';
import { ContentAssistantModule } from './modules/content-assistant/content-assistant.module';
import { AuthModule } from './modules/auth/auth.module';
import { ContentModule } from './modules/content/content.module';
import { ContentTemplateModule } from './modules/content-template/content-template.module';
import { MediaModule } from './modules/media/media.module';
import { PlatformSdkModule } from './modules/platform-sdk/platform-sdk.module';
import { SchedulerModule } from './modules/scheduler/scheduler.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { AuditModule } from './modules/audit/audit.module';
import { NotificationModule } from './modules/notification/notification.module';
import { TeamModule } from './modules/team/team.module';
import { WorkflowModule } from './modules/workflow/workflow.module';
import { UserModule } from './modules/user/user.module';
import { EngagementModule } from './modules/engagement/engagement.module';
import { HealthModule } from './modules/health/health.module';
import { WalletModule } from './modules/wallet/wallet.module';
import { QueueModule } from './modules/queue/queue.module';
import { ReceiptModule } from './modules/receipt/receipt.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ContentAssistantModule,
    // Global rate limiting: in-memory sliding window, keyed by authenticated
    // user id (falls back to client IP). Limits are env-tunable. Replace the
    // storage with a Redis-backed one (ThrottlerStorageRedisService) for a
    // multi-instance deployment.
    ThrottlerModule.forRoot([
      {
        ttl: Number(process.env.RATE_LIMIT_TTL_MS ?? 60_000),
        limit: Number(process.env.RATE_LIMIT_MAX ?? 100),
        // Skip the health probe so orchestrators aren't throttled.
        skipIf: (ctx) => {
          const req = ctx.switchToHttp().getRequest();
          return req?.url?.includes('/health') ?? false;
        },
        getTracker: (req: Record<string, any>) => {
          const user = req?.user as { userId?: string } | undefined;
          if (user?.userId) return user.userId;
          const fwd = req?.headers?.['x-forwarded-for'];
          if (typeof fwd === 'string' && fwd.length > 0) return fwd.split(',')[0].trim();
          return req?.ip ?? req?.socket?.remoteAddress ?? 'unknown';
        },
      },
    ]),
    PrismaModule,
    CryptoModule,
    AuthModule,
    ContentModule,
    ContentTemplateModule,
    MediaModule,
    UserModule,
    TeamModule,
    AccountModule,
    AdaptationModule,
    SchedulerModule,
    PlatformSdkModule,
    AnalyticsModule,
    WorkflowModule,
    AuditModule,
    NotificationModule,
    HealthModule,
    EngagementModule,
    WalletModule,
    QueueModule,
    ReceiptModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Register the throttler guard globally so every route is rate-limited.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
