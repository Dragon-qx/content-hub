import {
  Body,
  Controller,
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
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { PlatformSdkService } from './platform-sdk.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  FetchCommentsQueryDto,
  FetchMessagesQueryDto,
  PublishContentDto,
  ReplyCommentDto,
  ReplyMessageDto,
  ValidateCredentialsDto,
} from './dto/platform-sdk.dto';

@ApiTags('Platform SDK')
@ApiBearerAuth()
@Controller('platform-sdk')
@UseGuards(JwtAuthGuard)
export class PlatformSdkController {
  constructor(private readonly platformSdk: PlatformSdkService) {}

  @ApiOperation({ summary: 'Publish content', description: 'Publishes a piece of content to a platform (optionally through a specific account).' })
  @ApiQuery({ name: 'accountId', required: false, description: 'Override the account to publish through' })
  @ApiCreatedResponse({ description: 'Published; returns the platform post record.' })
  @ApiBadRequestResponse({ description: 'Validation error or content not APPROVED.' })
  @Post('publish')
  publish(@Body() dto: PublishContentDto, @Query('accountId') accountId?: string) {
    return this.platformSdk.publish(
      dto.contentId,
      dto.platform,
      dto.payload ?? {},
      accountId,
    );
  }

  @ApiOperation({ summary: 'Fetch comments', description: 'Fetches the recent comments for a social account / post from its platform adapter.' })
  @ApiOkResponse({ description: 'List of comments.' })
  @Get('comments')
  getComments(@Query() query: FetchCommentsQueryDto) {
    return this.platformSdk.fetchComments(
      query.accountId,
      query.platform,
      query.postExternalId,
    );
  }

  @ApiOperation({ summary: 'Reply to a comment', description: 'Replies to a single comment via the platform adapter.' })
  @ApiCreatedResponse({ description: 'Reply posted.' })
  @Post('comments/reply')
  replyToComment(@Body() dto: ReplyCommentDto) {
    return this.platformSdk.replyToComment(
      dto.accountId,
      dto.platform,
      dto.commentId,
      dto.content,
    );
  }

  @ApiOperation({ summary: 'Fetch private messages', description: 'Fetches the recent private messages for a social account from its platform adapter.' })
  @ApiOkResponse({ description: 'List of messages.' })
  @Get('messages')
  getMessages(@Query() query: FetchMessagesQueryDto) {
    return this.platformSdk.fetchMessages(query.accountId, query.platform);
  }

  @ApiOperation({ summary: 'Reply to a private message', description: 'Replies to a private message via the platform adapter.' })
  @ApiCreatedResponse({ description: 'Reply sent.' })
  @Post('messages/reply')
  replyToMessage(@Body() dto: ReplyMessageDto) {
    return this.platformSdk.replyToMessage(
      dto.accountId,
      dto.platform,
      dto.messageId,
      dto.content,
    );
  }

  @ApiOperation({ summary: 'Get publish status', description: 'Polls the live status of a published post.' })
  @ApiParam({ name: 'platform', description: 'Platform' })
  @ApiParam({ name: 'externalId', description: 'External post id' })
  @Get(':platform/status/:externalId')
  getStatus(
    @Param('platform') platform: string,
    @Param('externalId') externalId: string,
  ) {
    return this.platformSdk.getStatus(externalId, platform);
  }

  @ApiOperation({ summary: 'Get publish metrics', description: 'Polls engagement metrics of a published post.' })
  @ApiParam({ name: 'platform', description: 'Platform' })
  @ApiParam({ name: 'externalId', description: 'External post id' })
  @Get(':platform/metrics/:externalId')
  getMetrics(
    @Param('platform') platform: string,
    @Param('externalId') externalId: string,
  ) {
    return this.platformSdk.getMetrics(externalId, platform);
  }

  @ApiOperation({ summary: 'Validate credentials', description: 'Dry-runs credential validation without persisting an account.' })
  @ApiCreatedResponse({ description: 'Credentials validation result.' })
  @Post('validate')
  validate(@Body() dto: ValidateCredentialsDto) {
    return this.platformSdk.validate(dto.platform, dto.credentials);
  }
}
