import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { AdaptationService } from './adaptation.service';
import {
  PlatformRulesQueryDto,
  PreviewAdaptationDto,
} from './dto/preview-adaptation.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('adaptation')
@UseGuards(JwtAuthGuard)
export class AdaptationController {
  constructor(private readonly adaptation: AdaptationService) {}

  /**
   * Project how a draft will look on each platform without persisting
   * anything. The live preview pane calls this as the author edits.
   */
  @Post('preview')
  preview(@Body() dto: PreviewAdaptationDto) {
    return this.adaptation.adapt({
      body: dto.body,
      contentType: dto.contentType,
      imageCount: dto.imageCount,
      videoCount: dto.videoCount,
      videoDurationSec: dto.videoDurationSec,
      platforms: dto.platforms,
    });
  }

  /** The static rule catalog backing the preview (limits + hints). */
  @Get('rules')
  rules(@Query() query: PlatformRulesQueryDto) {
    return this.adaptation.getRules(query.platform);
  }
}
