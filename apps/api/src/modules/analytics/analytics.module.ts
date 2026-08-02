import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { AnalyticsReportModule } from './report/report.module';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { TeamModule } from '../team/team.module';

@Module({
  imports: [PrismaModule, TeamModule, AnalyticsReportModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
