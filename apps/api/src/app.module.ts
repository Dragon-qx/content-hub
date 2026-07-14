import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './common/prisma/prisma.module';
import { AccountModule } from './modules/account/account.module';
import { AuthModule } from './modules/auth/auth.module';
import { ContentModule } from './modules/content/content.module';
import { MediaModule } from './modules/media/media.module';
import { PlatformSdkModule } from './modules/platform-sdk/platform-sdk.module';
import { SchedulerModule } from './modules/scheduler/scheduler.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { AuditModule } from './modules/audit/audit.module';
import { TeamModule } from './modules/team/team.module';
import { WorkflowModule } from './modules/workflow/workflow.module';
import { UserModule } from './modules/user/user.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    ContentModule,
    MediaModule,
    UserModule,
    TeamModule,
    AccountModule,
    SchedulerModule,
    PlatformSdkModule,
    AnalyticsModule,
    WorkflowModule,
    AuditModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
