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
import { SchedulerService } from './scheduler.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { SchedulePublishDto } from './dto/scheduler.dto';

@ApiTags('Scheduler')
@ApiBearerAuth()
@Controller('scheduler')
@UseGuards(JwtAuthGuard)
export class SchedulerController {
  constructor(private readonly scheduler: SchedulerService) {}

  @ApiOperation({ summary: 'Schedule a publish job', description: 'Creates a QUEUED job to publish a piece of content to a platform at a given time.' })
  @ApiCreatedResponse({ description: 'Job created (status QUEUED).' })
  @ApiBadRequestResponse({ description: 'Validation error.' })
  @Post()
  schedule(@Body() dto: SchedulePublishDto) {
    return this.scheduler.schedule(
      dto.contentId,
      dto.platform,
      dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
    );
  }

  @ApiOperation({ summary: 'List publish jobs', description: 'Paginated listing of publish jobs.' })
  @Get()
  findAll(@Query() query: PaginationQueryDto) {
    return this.scheduler.findAll({ skip: query.skip, take: query.take });
  }

  @ApiOperation({ summary: 'Get publish job by id' })
  @ApiParam({ name: 'id', description: 'Publish job id' })
  @ApiOkResponse({ description: 'Publish job detail.' })
  @ApiNotFoundResponse({ description: 'Job not found.' })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.scheduler.findOne(id);
  }

  @ApiOperation({ summary: 'Cancel a publish job', description: 'Cancels a QUEUED job before it runs.' })
  @ApiParam({ name: 'id', description: 'Publish job id' })
  @Delete(':id')
  cancel(@Param('id') id: string) {
    return this.scheduler.cancel(id);
  }

  @ApiOperation({ summary: 'Retry a failed job', description: 'Moves a FAILED job back to QUEUED.' })
  @ApiParam({ name: 'id', description: 'Publish job id' })
  @Post(':id/retry')
  retry(@Param('id') id: string) {
    return this.scheduler.retry(id);
  }

  /** Manually trigger execution of a queued job. */
  @ApiOperation({ summary: 'Execute a job now', description: 'Immediately runs a queued publish job.' })
  @ApiParam({ name: 'id', description: 'Publish job id' })
  @Post(':id/execute')
  async execute(@Param('id') id: string) {
    await this.scheduler.executeJob(id);
    return this.scheduler.findOne(id);
  }
}
