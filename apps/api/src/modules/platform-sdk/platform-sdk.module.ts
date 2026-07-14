import { Module } from '@nestjs/common';
import { PlatformSdkController } from './platform-sdk.controller';
import { PlatformSdkService } from './platform-sdk.service';

@Module({ controllers: [PlatformSdkController], providers: [PlatformSdkService], exports: [PlatformSdkService] })
export class PlatformSdkModule {}
