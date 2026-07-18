import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AdaptationService } from './adaptation.service';
import {
  PlatformRulesQueryDto,
  PreviewAdaptationDto,
} from './dto/preview-adaptation.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Adaptation')
@ApiBearerAuth()
@Controller('adaptation')
@UseGuards(JwtAuthGuard)
export class AdaptationController {
  constructor(private readonly adaptation: AdaptationService) {}

  /**
   * Project how a draft will look on each platform without persisting
   * anything. The live preview pane calls this as the author edits.
   */
  @ApiOperation({
    summary: 'Preview cross-platform adaptation',
    description:
      'Projects a draft across target platforms without writing anything. Used by the live preview pane as the author edits.',
  })
  @Post('preview')
  @ApiCreatedResponse({ description: 'Adapted preview per platform.' })
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
  @ApiOperation({ summary: 'List platform rules', description: 'Returns the static catalog of per-platform limits + hints (single platform or all).' })
  @ApiOkResponse({ description: 'Platform rule catalog.' })
  @Get('rules')
  rules(@Query() query: PlatformRulesQueryDto) {
    return this.adaptation.getRules(query.platform);
  }
}
