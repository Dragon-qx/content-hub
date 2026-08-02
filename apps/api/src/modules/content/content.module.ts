import { Module } from '@nestjs/common';
import { ContentController } from './content.controller';
import { ContentService } from './content.service';
import { WorkflowModule } from '../workflow/workflow.module';
import { AuditModule } from '../audit/audit.module';
import { TeamAccessModule } from '../common/team-access/team-access.module';

@Module({
  imports: [WorkflowModule, AuditModule, TeamAccessModule],
  controllers: [ContentController],
  providers: [ContentService],
  exports: [ContentService],
})
export class ContentModule {}
