import { Module } from '@nestjs/common';
import { PlatformSdkService } from '../platform-sdk/platform-sdk.service';
import { EngagementService } from './engagement.service';
import { EngagementController } from './engagement.controller';
import { AiReplySuggestionsService } from './ai-reply-suggestions.service';
import { TeamAccessModule } from '../common/team-access/team-access.module';

@Module({
  imports: [TeamAccessModule],
  controllers: [EngagementController],
  providers: [EngagementService, PlatformSdkService, AiReplySuggestionsService],
  exports: [EngagementService],
})
export class EngagementModule {}
