import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ContentAssistantService } from './content-assistant.service';
import {
  ContentAuditDto,
  TagExtractDto,
  TitleOptimizeDto,
  VariantGenerateDto,
} from './dto/content-assistant.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

/**
 * AI Content Assistant (PRD §3.3 V1.1 AI 辅助写作). Four endpoints, each a
 * deterministic helper over the current draft: optimize titles, extract tags,
 * audit against platform rules + quality heuristics, and produce copy variants.
 *
 * All operations are synchronous projections over the supplied draft — they do
 * not persist anything and do not call external services, so they are safe to
 * invoke from the editor on every keystroke (debounced by the client).
 */
@ApiTags('AI Content Assistant')
@ApiBearerAuth()
@Controller('assistant')
@UseGuards(JwtAuthGuard)
export class ContentAssistantController {
  constructor(private readonly assistant: ContentAssistantService) {}

  @ApiOperation({ summary: 'Optimize titles', description: 'Produces engagement-optimized title variants from the draft.' })
  @Post('titles')
  @ApiCreatedResponse({ description: 'Optimized title variants.' })
  optimizeTitles(@Body() dto: TitleOptimizeDto) {
    return this.assistant.optimizeTitles(dto);
  }

  @ApiOperation({ summary: 'Extract tags', description: 'Suggests keyword tags extracted from the draft body.' })
  @Post('tags')
  @ApiCreatedResponse({ description: 'Suggested tags.' })
  extractTags(@Body() dto: TagExtractDto) {
    return this.assistant.extractTags(dto);
  }

  @ApiOperation({ summary: 'Audit draft', description: 'Audits the draft against platform rules + cross-cutting quality heuristics.' })
  @Post('audit')
  @ApiCreatedResponse({ description: 'Audit findings.' })
  audit(@Body() dto: ContentAuditDto) {
    return this.assistant.audit(dto);
  }

  @ApiOperation({ summary: 'Generate copy variants', description: 'Produces platform-aware copy variants (short/long/formal/social).' })
  @Post('variants')
  @ApiCreatedResponse({ description: 'Generated copy variants.' })
  generateVariants(@Body() dto: VariantGenerateDto) {
    return this.assistant.generateVariants(dto);
  }
}
