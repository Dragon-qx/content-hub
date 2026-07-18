import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { WorkflowService } from './workflow.service';
import { WorkflowTimeoutService } from './workflow-timeout.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CreateWorkflowDto,
  ListWorkflowQueryDto,
  TimeoutSummaryQueryDto,
  WorkflowActionDto,
  WorkflowTimeoutConfigDto,
} from './dto/workflow.dto';

@ApiTags('Workflow')
@ApiBearerAuth()
@Controller('workflow')
@UseGuards(JwtAuthGuard)
export class WorkflowController {
  constructor(
    private readonly workflow: WorkflowService,
    private readonly workflowTimeout: WorkflowTimeoutService,
  ) {}

  @ApiOperation({ summary: 'Submit content for approval', description: 'Creates an approval workflow (PENDING) for a content item assigned to an approver.' })
  @ApiCreatedResponse({ description: 'Workflow created (status PENDING).' })
  @ApiBadRequestResponse({ description: 'Validation error or duplicate pending flow.' })
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
  @ApiCreatedResponse({ description: 'Workflow APPROVED.' })
  @ApiBadRequestResponse({ description: 'Workflow not PENDING.' })
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
  @ApiOkResponse({ description: 'Workflow detail.' })
  @ApiNotFoundResponse({ description: 'Workflow not found.' })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.workflow.findOne(id);
  }

  @ApiOperation({ summary: 'Set timeout config for a workflow' })
  @ApiParam({ name: 'id', description: 'Workflow id' })
  @ApiOkResponse({ description: 'Timeout config updated.' })
  @ApiBadRequestResponse({ description: 'Invalid config (e.g. ESCALATE without escalateTo).' })
  @Patch(':id/timeout-config')
  setTimeoutConfig(@Param('id') id: string, @Body() dto: WorkflowTimeoutConfigDto) {
    return this.workflowTimeout.setConfig(id, dto);
  }

  @ApiOperation({ summary: 'List workflows grouped by timeout status (overdue / approaching / ok)' })
  @ApiOkResponse({ description: 'Timeout summary.' })
  @Get('timeout-summary')
  timeoutSummary(@Query() query: TimeoutSummaryQueryDto) {
    return this.workflowTimeout.getTimeoutSummary(query.windowHours ?? 24);
  }
}
