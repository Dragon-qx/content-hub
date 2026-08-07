import { Module } from '@nestjs/common';
import { PlatformSdkController } from './platform-sdk.controller';
import { PlatformSdkService } from './platform-sdk.service';
import { AdaptationModule } from '../adaptation/adaptation.module';
import { TeamAccessModule } from '../common/team-access/team-access.module';

@Module({
  imports: [AdaptationModule, TeamAccessModule],
  controllers: [PlatformSdkController],
  providers: [PlatformSdkService],
  exports: [PlatformSdkService],
})
export class PlatformSdkModule {}
