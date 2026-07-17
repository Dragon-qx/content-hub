import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { WorkflowService } from './workflow.service';
import {
  CreateWorkflowDto,
  ListWorkflowQueryDto,
  WorkflowActionDto,
} from './dto/workflow.dto';

@Controller('workflow')
export class WorkflowController {
  constructor(private readonly workflow: WorkflowService) {}

  @Post('approval')
  createApproval(@Body() dto: CreateWorkflowDto) {
    return this.workflow.createApprovalFlow(
      dto.contentId ?? '',
      dto.approverId,
      dto.summary,
    );
  }

  @Post(':id/approve')
  approve(@Param('id') id: string, @Body() dto: WorkflowActionDto) {
    return this.workflow.approve(id, dto.approverId, dto.comment);
  }

  @Post(':id/reject')
  reject(@Param('id') id: string, @Body() dto: WorkflowActionDto) {
    return this.workflow.reject(id, dto.approverId, dto.comment);
  }

  @Get()
  findAll(@Query() query: ListWorkflowQueryDto) {
    return this.workflow.findAll({
      skip: query.skip,
      take: query.take,
      contentId: query.contentId,
      approverId: query.approverId,
      status: query.status,
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.workflow.findOne(id);
  }
}
