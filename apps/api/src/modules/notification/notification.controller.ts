import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NotificationService } from './notification.service';
import {
  CreateNotificationDto,
  ListNotificationsQueryDto,
} from './dto/notification.dto';

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationController {
  constructor(private readonly notifications: NotificationService) {}

  /** Create a notification for the acting user (or a target user, for admins). */
  @ApiOperation({ summary: 'Create a notification' })
  @Post()
  create(@Body() dto: CreateNotificationDto) {
    return this.notifications.create(dto);
  }

  @ApiOperation({ summary: 'List my notifications', description: 'Paginated listing with an unread-only filter.' })
  @Get()
  listForUser(
    @CurrentUser() user: AuthUser,
    @Query() query: ListNotificationsQueryDto,
  ) {
    return this.notifications.listForUser(user.userId, {
      skip: query.skip,
      take: query.take,
      unreadOnly: query.unreadOnly,
    });
  }

  @ApiOperation({ summary: 'Mark one notification read' })
  @ApiParam({ name: 'id', description: 'Notification id' })
  @Patch(':id/read')
  markRead(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.notifications.markRead(id, user.userId);
  }

  @ApiOperation({ summary: 'Mark all notifications read' })
  @Patch('read-all')
  markAllRead(@CurrentUser() user: AuthUser) {
    return this.notifications.markAllRead(user.userId);
  }
}
