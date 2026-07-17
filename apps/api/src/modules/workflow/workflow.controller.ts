import { Body, Controller, Get, Param, Post, Query, NotFoundException } from '@nestjs/common';
import { WorkflowService } from './workflow.service';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

@Controller('workflow')
export class WorkflowController {
  constructor(private readonly workflow: WorkflowService) {}

  @Post('approval') createApproval(@Body() dto: any) {
    return this.workflow.createApprovalFlow(dto);
  }
  @Post(':id/approve') approve(@Param('id') id: string, @Body() dto: any) {
    return this.workflow.approve(id, dto);
  }
  @Post(':id/reject') reject(@Param('id') id: string, @Body() dto: any) {
    return this.workflow.reject(id, dto);
  }
  @Get() findAll(@Query() query: PaginationQueryDto) { return this.workflow.findAll({ skip: query.skip, take: query.take }); }
  @Get(':id') findOne(@Param('id') id: string) { return this.workflow.findOne(id); }
}
