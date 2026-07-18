import { Global, Module } from '@nestjs/common';
import { AdaptationController } from './adaptation.controller';
import { AdaptationService } from './adaptation.service';

// Global so PlatformSdkService can be injected directly in other modules
// (e.g. EngagementModule, SchedulerModule) without each of them importing
// AdaptationModule — the same pattern PrismaModule uses.
@Global()
@Module({
  controllers: [AdaptationController],
  providers: [AdaptationService],
  exports: [AdaptationService],
})
export class AdaptationModule {}
