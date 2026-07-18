import { Module } from '@nestjs/common';
import { PlatformSdkController } from './platform-sdk.controller';
import { PlatformSdkService } from './platform-sdk.service';
import { AdaptationModule } from '../adaptation/adaptation.module';

@Module({
  imports: [AdaptationModule],
  controllers: [PlatformSdkController],
  providers: [PlatformSdkService],
  exports: [PlatformSdkService],
})
export class PlatformSdkModule {}
