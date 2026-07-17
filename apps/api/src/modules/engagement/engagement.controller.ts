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
import { AuthUser, CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { EngagementService } from './engagement.service';
import {
  CreateKeywordDto,
  CreateTemplateDto,
  IngestCommentsDto,
  ListCommentsQueryDto,
  ReplyCommentDto,
  SyncTeamDto,
} from './dto/engagement.dto';

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
  @Get('stats')
  async stats(
    @CurrentUser() user: AuthUser,
    @Query('teamId') teamId?: string,
  ) {
    return this.engagement.stats(await this.teamIdFor(user, teamId));
  }

  /** Unified comment inbox with filters + pagination. */
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
  @Post('ingest')
  ingest(@Body() dto: IngestCommentsDto) {
    return this.engagement.ingest(dto.accountId, dto.postExternalId);
  }

  /** Reply to a single comment. */
  @Patch('comments/:id/reply')
  reply(
    @Param('id') id: string,
    @Body() dto: ReplyCommentDto,
  ) {
    return this.engagement.reply(id, dto.content);
  }

  /**
   * Manually trigger a comment sync for the acting team (resolved from the
   * caller if not supplied). The background worker also does this on a timer.
   */
  @Post('sync')
  async sync(@CurrentUser() user: AuthUser, @Body() dto: SyncTeamDto) {
    const teamId =
      dto.teamId && dto.teamId.trim()
        ? dto.teamId.trim()
        : await this.teamIdFor(user, undefined);
    return this.engagement.syncTeam(teamId);
  }

  // ── Sentiment keyword alerts ────────────────────────────────────────

  /** List the team's watch keywords. */
  @Get('keywords')
  async listKeywords(
    @CurrentUser() user: AuthUser,
    @Query('teamId') teamId?: string,
  ) {
    return this.engagement.listKeywords(await this.teamIdFor(user, teamId));
  }

  /** Add a watch keyword for sentiment alerts. */
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

  @Get('templates')
  listTemplates(@CurrentUser() user: AuthUser) {
    return this.engagement.listTemplates(user.userId);
  }

  @Post('templates')
  createTemplate(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateTemplateDto,
  ) {
    return this.engagement.createTemplate(user.userId, dto);
  }

  @Delete('templates/:id')
  deleteTemplate(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.engagement.deleteTemplate(id, user.userId);
  }
}
