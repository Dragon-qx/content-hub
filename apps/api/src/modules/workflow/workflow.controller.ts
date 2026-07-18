import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { WorkflowService } from './workflow.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CreateWorkflowDto,
  ListWorkflowQueryDto,
  WorkflowActionDto,
} from './dto/workflow.dto';

@ApiTags('Workflow')
@ApiBearerAuth()
@Controller('workflow')
@UseGuards(JwtAuthGuard)
export class WorkflowController {
  constructor(private readonly workflow: WorkflowService) {}

  @ApiOperation({ summary: 'Submit content for approval', description: 'Creates an approval workflow (PENDING) for a content item assigned to an approver.' })
  @Post('approval')
  createApproval(@Body() dto: CreateWorkflowDto) {
    return this.workflow.createApprovalFlow(
      dto.contentId ?? '',
      dto.approverId,
      dto.summary,
    );
  }

  @ApiOperation({ summary: 'Approve a workflow', description: 'Marks the workflow APPROVED and cascades to the content.' })
  @ApiParam({ name: 'id', description: 'Workflow id' })
  @Post(':id/approve')
  approve(@Param('id') id: string, @Body() dto: WorkflowActionDto) {
    return this.workflow.approve(id, dto.approverId, dto.comment);
  }

  @ApiOperation({ summary: 'Reject a workflow', description: 'Marks the workflow REJECTED.' })
  @ApiParam({ name: 'id', description: 'Workflow id' })
  @Post(':id/reject')
  reject(@Param('id') id: string, @Body() dto: WorkflowActionDto) {
    return this.workflow.reject(id, dto.approverId, dto.comment);
  }

  @ApiOperation({ summary: 'List workflows', description: 'Paginated listing with content / approver / status filters.' })
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

  @ApiOperation({ summary: 'Get workflow by id' })
  @ApiParam({ name: 'id', description: 'Workflow id' })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.workflow.findOne(id);
  }
}
