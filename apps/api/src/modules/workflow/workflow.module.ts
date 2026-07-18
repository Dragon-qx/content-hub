import { Module } from '@nestjs/common';
import { WorkflowController } from './workflow.controller';
import { WorkflowService } from './workflow.service';
import { WorkflowTimeoutService } from './workflow-timeout.service';
import { NotificationModule } from '../notification/notification.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [NotificationModule, AuditModule],
  controllers: [WorkflowController],
  providers: [WorkflowService, WorkflowTimeoutService],
  exports: [WorkflowService, WorkflowTimeoutService],
})
export class WorkflowModule {}
