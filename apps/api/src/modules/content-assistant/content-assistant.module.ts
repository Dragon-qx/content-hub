import { Module } from '@nestjs/common';
import { ContentAssistantController } from './content-assistant.controller';
import { ContentAssistantService } from './content-assistant.service';

@Module({
  controllers: [ContentAssistantController],
  providers: [ContentAssistantService],
  exports: [ContentAssistantService],
})
export class ContentAssistantModule {}
