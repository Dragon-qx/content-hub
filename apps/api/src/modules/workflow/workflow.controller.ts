import { Body, Controller, Get, Param, Post, Query, ParseIntPipe } from '@nestjs/common';
import { WorkflowService } from './workflow.service';

@Controller('workflow')
export class WorkflowController {
  constructor(private readonly workflow: WorkflowService) {}

  @Post('approval') createApproval(@Body() dto: any) {
    return this.workflow.createApprovalFlow(dto.contentId, dto.approverId);
  }
  @Post(':id/approve') approve(@Param('id') id: string, @Body() dto: any) {
    return this.workflow.approve(id, dto.approverId, dto.comment);
  }
  @Post(':id/reject') reject(@Param('id') id: string, @Body() dto: any) {
    return this.workflow.reject(id, dto.approverId, dto.reason);
  }
  @Get() findAll(
    @Query('skip', new ParseIntPipe({ optional: true })) skip?: number,
    @Query('take', new ParseIntPipe({ optional: true })) take?: number,
  ) { return this.workflow.findAll({ skip, take }); }
  @Get(':id') findOne(@Param('id') id: string) { return this.workflow.findOne(id); }
}
