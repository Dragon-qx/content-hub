import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { SchedulePublishDto } from './dto/scheduler.dto';

@Controller('scheduler')
@UseGuards(JwtAuthGuard)
export class SchedulerController {
  constructor(private readonly scheduler: SchedulerService) {}

  @Post()
  schedule(@Body() dto: SchedulePublishDto) {
    return this.scheduler.schedule(
      dto.contentId,
      dto.platform,
      dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
    );
  }

  @Get()
  findAll(@Query() query: PaginationQueryDto) {
    return this.scheduler.findAll({ skip: query.skip, take: query.take });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.scheduler.findOne(id);
  }

  @Delete(':id')
  cancel(@Param('id') id: string) {
    return this.scheduler.cancel(id);
  }

  @Post(':id/retry')
  retry(@Param('id') id: string) {
    return this.scheduler.retry(id);
  }

  /** Manually trigger execution of a queued job. */
  @Post(':id/execute')
  async execute(@Param('id') id: string) {
    await this.scheduler.executeJob(id);
    return this.scheduler.findOne(id);
  }
}
