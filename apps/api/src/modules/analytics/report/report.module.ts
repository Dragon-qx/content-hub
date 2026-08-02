import { Module } from '@nestjs/common';
import { AnalyticsReportService } from './report.service';

@Module({
  providers: [AnalyticsReportService],
  exports: [AnalyticsReportService],
})
export class AnalyticsReportModule {}
