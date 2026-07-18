import { Module } from '@nestjs/common';
import { ContentAssistantController } from './content-assistant.controller';
import { ContentAssistantService } from './content-assistant.service';
import {
  LlmProviderFactory,
  HeuristicLlmProvider,
  OpenAiLlmProvider,
  AnthropicLlmProvider,
} from './llm.service';

@Module({
  controllers: [ContentAssistantController],
  providers: [
    ContentAssistantService,
    // LLM providers
    HeuristicLlmProvider,
    OpenAiLlmProvider,
    AnthropicLlmProvider,
    LlmProviderFactory,
  ],
  exports: [ContentAssistantService],
})
export class ContentAssistantModule {}
