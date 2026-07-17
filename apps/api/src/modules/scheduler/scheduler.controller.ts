import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

@Controller('scheduler')
export class SchedulerController {
  constructor(private readonly scheduler: SchedulerService) {}

  @Post() schedule(@Body() dto: any) {
    return this.scheduler.schedule(dto.contentId, dto.platform, new Date(dto.scheduledAt));
  }
  @Get() findAll(@Query() query: PaginationQueryDto) { return this.scheduler.findAll({ skip: query.skip, take: query.take }); }
  @Get(':id') findOne(@Param('id') id: string) { return this.scheduler.findOne(id); }
  @Delete(':id') cancel(@Param('id') id: string) { return this.scheduler.cancel(id); }
  @Post(':id/retry') retry(@Param('id') id: string) { return this.scheduler.retry(id); }
}
