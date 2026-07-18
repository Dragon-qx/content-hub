import { Module } from '@nestjs/common';
import { SchedulerController } from './scheduler.controller';
import { SchedulerService } from './scheduler.service';
import { SchedulingRecommendationService } from './scheduling-recommendation.service';

@Module({
  controllers: [SchedulerController],
  providers: [SchedulerService, SchedulingRecommendationService],
  exports: [SchedulerService, SchedulingRecommendationService],
})
export class SchedulerModule {}
