import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { EngagementService } from './engagement.service';
import {
  CreateKeywordDto,
  CreateTemplateDto,
  IngestCommentsDto,
  IngestMessagesDto,
  ListCommentsQueryDto,
  ListMessagesQueryDto,
  ReplyCommentDto,
  SyncTeamDto,
} from './dto/engagement.dto';

@ApiTags('Engagement')
@ApiBearerAuth()
@Controller('engagement')
@UseGuards(JwtAuthGuard)
export class EngagementController {
  constructor(private readonly engagement: EngagementService) {}

  /** Resolve the acting team: explicit query param, else the user's first team. */
  private async teamIdFor(
    user: AuthUser,
    explicit?: string,
  ): Promise<string> {
    const teamId = explicit?.trim();
    if (teamId) return teamId;

    const membership = await this.engagement.firstTeamForUser(user.userId);
    return membership;
  }

  /** Inbox header stats (totals + per-platform breakdown). */
  @ApiOperation({ summary: 'Engagement inbox stats', description: 'Totals + per-platform breakdown of comments and messages.' })
  @Get('stats')
  async stats(
    @CurrentUser() user: AuthUser,
    @Query('teamId') teamId?: string,
  ) {
    return this.engagement.stats(await this.teamIdFor(user, teamId));
  }

  /** Unified comment inbox with filters + pagination. */
  @ApiOperation({ summary: 'List comments', description: 'Paginated comment inbox with platform / sentiment / unreplied filters.' })
  @Get('comments')
  async listComments(
    @CurrentUser() user: AuthUser,
    @Query() query: ListCommentsQueryDto,
  ) {
    return this.engagement.listComments({
      teamId: await this.teamIdFor(user, query.teamId),
      platform: query.platform,
      sentiment: query.sentiment,
      unreplied: query.unreplied,
      skip: query.skip,
      take: query.take,
    });
  }

  /** Pull fresh comments for a social account from its platform adapter. */
  @ApiOperation({ summary: 'Ingest comments', description: 'Pulls the latest comments for an account / post from the platform adapter.' })
  @Post('ingest')
  @ApiCreatedResponse({ description: 'Comments ingested.' })
  ingest(@Body() dto: IngestCommentsDto) {
    return this.engagement.ingest(dto.accountId, dto.postExternalId);
  }

  /** AI-suggested reply drafts for a single comment. */
  @ApiOperation({
    summary: 'AI reply suggestions for a comment',
    description:
      'Deterministic, fully-local generation of up-to-two reply drafts, ' +
      'classified by sentiment/intent. No external LLM is called.',
  })
  @ApiParam({ name: 'id', description: 'Comment id' })
  @Get('comments/:id/reply-suggestions')
  async suggestReplies(@Param('id') id: string) {
    return this.engagement.aiSuggestReplies(id);
  }

  /** Reply to a single comment. */
  @ApiOperation({ summary: 'Reply to a comment' })
  @ApiParam({ name: 'id', description: 'Comment id' })
  @Patch('comments/:id/reply')
  reply(
    @Param('id') id: string,
    @Body() dto: ReplyCommentDto,
  ) {
    return this.engagement.reply(id, dto.content);
  }

  /** Unified message inbox with filters + pagination. */
  @ApiOperation({ summary: 'List private messages', description: 'Paginated message inbox with platform / conversation filters.' })
  @ApiOkResponse({ description: 'Paginated message list.' })
  @Get('messages')
  async listMessages(
    @CurrentUser() user: AuthUser,
    @Query() query: ListMessagesQueryDto,
  ) {
    return this.engagement.listMessages({
      teamId: await this.teamIdFor(user, query.teamId),
      platform: query.platform,
      conversationId: query.conversationId,
      sentByMe: query.sentByMe,
      skip: query.skip,
      take: query.take,
    });
  }

  /** Pull fresh private messages for a social account from its adapter. */
  @ApiOperation({ summary: 'Ingest private messages', description: 'Pulls the latest DMs for an account from the platform adapter.' })
  @Post('messages/ingest')
  ingestMessages(@Body() dto: IngestMessagesDto) {
    return this.engagement.ingestMessages(dto.accountId);
  }

  /**
   * Manually trigger a comment + message sync for the acting team (resolved
   * from the caller if not supplied). The background worker also does this
   * on a timer.
   */
  @ApiOperation({ summary: 'Sync a team', description: 'Manually triggers comment + message ingestion for the acting team.' })
  @Post('sync')
  @ApiCreatedResponse({ description: 'Sync complete.' })
  async sync(@CurrentUser() user: AuthUser, @Body() dto: SyncTeamDto) {
    const teamId =
      dto.teamId && dto.teamId.trim()
        ? dto.teamId.trim()
        : await this.teamIdFor(user, undefined);
    return this.engagement.syncTeam(teamId);
  }

  // ── Sentiment keyword alerts ────────────────────────────────────────

  /** List the team's watch keywords. */
  @ApiOperation({ summary: 'List watch keywords' })
  @Get('keywords')
  async listKeywords(
    @CurrentUser() user: AuthUser,
    @Query('teamId') teamId?: string,
  ) {
    return this.engagement.listKeywords(await this.teamIdFor(user, teamId));
  }

  /** Add a watch keyword for sentiment alerts. */
  @ApiOperation({ summary: 'Add watch keyword', description: 'Registers a keyword that triggers alerts on negative sentiment.' })
  @Post('keywords')
  async createKeyword(
    @CurrentUser() user: AuthUser,
    @Query('teamId') teamId: string,
    @Body() dto: CreateKeywordDto,
  ) {
    return this.engagement.createKeyword(
      await this.teamIdFor(user, teamId),
      user.userId,
      dto.keyword,
    );
  }

  /** Remove a watch keyword. */
  @ApiOperation({ summary: 'Delete watch keyword' })
  @ApiParam({ name: 'id', description: 'Keyword id' })
  @Delete('keywords/:id')
  async deleteKeyword(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Query('teamId') teamId?: string,
  ) {
    return this.engagement.deleteKeyword(
      id,
      await this.teamIdFor(user, teamId),
    );
  }

  // ── Quick-reply templates ─────────────────────────────────────────

  @ApiOperation({ summary: 'List quick-reply templates' })
  @Get('templates')
  listTemplates(@CurrentUser() user: AuthUser) {
    return this.engagement.listTemplates(user.userId);
  }

  @ApiOperation({ summary: 'Create quick-reply template' })
  @Post('templates')
  createTemplate(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateTemplateDto,
  ) {
    return this.engagement.createTemplate(user.userId, dto);
  }

  @ApiOperation({ summary: 'Delete quick-reply template' })
  @ApiParam({ name: 'id', description: 'Template id' })
  @Delete('templates/:id')
  deleteTemplate(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.engagement.deleteTemplate(id, user.userId);
  }
}
