import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';

@Controller('scheduler')
export class SchedulerController {
  constructor(private readonly scheduler: SchedulerService) {}

  @Post() schedule(@Body() dto: any) {
    return this.scheduler.schedule(dto.contentId, dto.platform, new Date(dto.scheduledAt));
  }
  @Get() findAll(
    @Query('skip', new ParseIntPipe({ optional: true })) skip?: number,
    @Query('take', new ParseIntPipe({ optional: true })) take?: number,
  ) { return this.scheduler.findAll({ skip, take }); }
  @Get(':id') findOne(@Param('id') id: string) { return this.scheduler.findOne(id); }
  @Delete(':id') cancel(@Param('id') id: string) { return this.scheduler.cancel(id); }
  @Post(':id/retry') retry(@Param('id') id: string) { return this.scheduler.retry(id); }
}
