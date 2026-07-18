import { Body, Controller, Post, UseGuards } from '@nestjs/common';
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
@Controller('assistant')
@UseGuards(JwtAuthGuard)
export class ContentAssistantController {
  constructor(private readonly assistant: ContentAssistantService) {}

  @Post('titles')
  optimizeTitles(@Body() dto: TitleOptimizeDto) {
    return this.assistant.optimizeTitles(dto);
  }

  @Post('tags')
  extractTags(@Body() dto: TagExtractDto) {
    return this.assistant.extractTags(dto);
  }

  @Post('audit')
  audit(@Body() dto: ContentAuditDto) {
    return this.assistant.audit(dto);
  }

  @Post('variants')
  generateVariants(@Body() dto: VariantGenerateDto) {
    return this.assistant.generateVariants(dto);
  }
}
