import { Module } from '@nestjs/common';
import { PlatformSdkService } from '../platform-sdk/platform-sdk.service';
import { EngagementService } from './engagement.service';
import { EngagementController } from './engagement.controller';

@Module({
  controllers: [EngagementController],
  providers: [EngagementService, PlatformSdkService],
})
export class EngagementModule {}
