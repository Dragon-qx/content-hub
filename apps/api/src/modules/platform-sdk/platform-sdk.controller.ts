import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { PlatformSdkService } from './platform-sdk.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PublishContentDto, ValidateCredentialsDto } from './dto/platform-sdk.dto';

@Controller('platform-sdk')
@UseGuards(JwtAuthGuard)
export class PlatformSdkController {
  constructor(private readonly platformSdk: PlatformSdkService) {}

  @Post('publish')
  publish(@Body() dto: PublishContentDto) {
    return this.platformSdk.publish(dto.contentId, dto.platform, dto.payload);
  }

  @Get(':platform/status/:externalId')
  getStatus(
    @Param('platform') platform: string,
    @Param('externalId') externalId: string,
  ) {
    return this.platformSdk.getStatus(externalId, platform);
  }

  @Get(':platform/metrics/:externalId')
  getMetrics(
    @Param('platform') platform: string,
    @Param('externalId') externalId: string,
  ) {
    return this.platformSdk.getMetrics(externalId, platform);
  }

  @Post('validate')
  validate(@Body() dto: ValidateCredentialsDto) {
    return this.platformSdk.validate(dto.platform, dto.credentials);
  }
}
