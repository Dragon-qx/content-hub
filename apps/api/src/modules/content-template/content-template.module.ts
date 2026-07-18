import { Module } from '@nestjs/common';
import { ContentTemplateController } from './content-template.controller';
import { ContentTemplateService } from './content-template.service';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [ContentTemplateController],
  providers: [ContentTemplateService],
  exports: [ContentTemplateService],
})
export class ContentTemplateModule {}
