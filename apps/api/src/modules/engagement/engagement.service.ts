import { Injectable, Logger } from '@nestjs/common';
import { Platform, Prisma, Sentiment } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  PlatformSdkService,
  FetchCommentsResult,
  FetchMessagesResult,
} from '../platform-sdk/platform-sdk.service';
import { NotificationService } from '../notification/notification.service';

/** Sentiment score at or below this is "strongly negative" → triggers an alert
 *  even without a keyword match. Mirrors the heuristic's [-1, 1] scale. */
const STRONG_NEGATIVE_THRESHOLD = -0.5;

/** A list query for the engagement inbox. */
export interface ListCommentsParams {
  teamId: string;
  platform?: Platform;
  sentiment?: Sentiment;
  unreplied?: boolean;
  skip?: number;
  take?: number;
}

/** Aggregated sentiment/count stats for the inbox header. */
export interface EngagementStats {
  total: number;
  unreplied: number;
  positive: number;
  neutral: number;
  negative: number;
  byPlatform: { platform: string; total: number; unreplied: number }[];
}

/** A list query for the message inbox. */
export interface MessageListParams {
  teamId: string;
  platform?: Platform;
  conversationId?: string;
  sentByMe?: boolean;
  skip?: number;
  take?: number;
}

const DEFAULT_TAKE = 20;

/**
 * Lightweight, language-agnostic sentiment heuristic. Scans the comment body
 * for positive/negative keywords (Chinese + English) and returns a score in
 * [-1, 1] plus the derived Sentiment label. Deterministic, dependency-free and
 * good enough to power the UI badges and filters.
 */
function analyzeSentiment(content: string): {
  score: number;
  sentiment: Sentiment;
} {
  const text = String(content ?? '').toLowerCase();

  const positive = [
    'good', 'great', 'love', 'thanks', 'nice', 'awesome', 'excellent',
    'perfect', 'amazing', 'wonderful', 'best', 'cool',
    '好', '赞', '棒', '喜欢', '感谢', '谢谢', '厉害', '优秀', '漂亮', '不错',
    '太棒了', '非常好', '推荐',
  ];
  const negative = [
    'bad', 'hate', 'terrible', 'awful', 'worst', 'suck', 'disappointing',
    'poor', 'broken', 'useless',
    '差', '烂', '垃圾', '差评', '失望', '难用', '恶心', '坑', '不好', '退款',
    '投诉',
  ];

  let score = 0;
  for (const w of positive) if (text.includes(w)) score += 1;
  for (const w of negative) if (text.includes(w)) score -= 1;

  // Normalise to [-1, 1] with a soft cap so long rants don't blow past the scale.
  const normalized = Math.max(-1, Math.min(1, score / 3));
  let sentiment: Sentiment = Sentiment.NEUTRAL;
  if (normalized > 0.15) sentiment = Sentiment.POSITIVE;
  else if (normalized < -0.15) sentiment = Sentiment.NEGATIVE;
  return { score: normalized, sentiment };
}

@Injectable()
export class EngagementService {
  private readonly logger = new Logger(EngagementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly platformSdk: PlatformSdkService,
    private readonly notifications: NotificationService,
  ) {}

  /**
   * Fetch comments for a social account from its platform adapter and upsert
   * them into EngagementComment. Idempotent on (accountId, externalId).
   *
   * Returns the number of comments stored and whether the adapter supports the
   * comments API (unsupported adapters are recorded as a no-op so the caller
   * can surface a graceful message).
   */
  async ingest(accountId: string, postExternalId?: string) {
    const account = await this.prisma.socialAccount.findUnique({
      where: { id: accountId },
    });
    if (!account) {
      throw new Error(`Social account ${accountId} not found`);
    }

    const result: FetchCommentsResult = await this.platformSdk.fetchComments(
      accountId,
      account.platform,
      postExternalId,
    );

    if (result.unsupported) {
      return { stored: 0, unsupported: true, platform: account.platform };
    }

    // Load the team's watch keywords once per ingest so each comment can be
    // checked for an alert. Cached; empty list when none are configured.
    const keywords = await this.prisma.sentimentKeyword.findMany({
      where: { teamId: account.teamId },
      select: { keyword: true },
    });
    const patterns = keywords.map((k) => k.keyword.trim().toLowerCase());

    let stored = 0;
    for (const c of result.items) {
      const { score, sentiment } = analyzeSentiment(c.content);

      // A comment is "alarming" the first time we see it: strongly negative, or
      // it contains one of the team's watch keywords. Upsert first so we know
      // whether it already existed (and was already alerted).
      const existing = await this.prisma.engagementComment.findUnique({
        where: { accountId_externalId: { accountId, externalId: c.id } },
        select: { id: true, alerted: true, content: true },
      });

      await this.prisma.engagementComment.upsert({
        where: {
          accountId_externalId: { accountId, externalId: c.id },
        },
        create: {
          accountId,
          externalId: c.id,
          platform: account.platform,
          postExternalId: c.postExternalId ?? postExternalId ?? null,
          authorName: c.authorName,
          authorId: c.authorId ?? null,
          content: c.content,
          likeCount: c.likeCount ?? 0,
          parentId: c.parentId ?? null,
          sentiment,
          sentimentScore: score,
          commentDate: c.createdAt ?? new Date(),
        },
        update: {
          authorName: c.authorName,
          content: c.content,
          likeCount: c.likeCount ?? 0,
          sentiment,
          sentimentScore: score,
          metadata: { reIngestedAt: new Date().toISOString() },
        },
      });
      stored += 1;

      // Only alert on genuinely new comments, and never twice for the same one.
      const matchesKeyword = patterns.some((p) =>
        c.content.toLowerCase().includes(p),
      );
      const stronglyNegative = score <= STRONG_NEGATIVE_THRESHOLD;
      if (!existing && (matchesKeyword || stronglyNegative)) {
        await this.raiseAlert(account, c, score, sentiment);
        await this.prisma.engagementComment.update({
          where: { accountId_externalId: { accountId, externalId: c.id } },
          data: { alerted: true },
        });
      }
    }

    // Touch the account so its sync staleness can be reported.
    await this.prisma.socialAccount.update({
      where: { id: accountId },
      data: { lastSyncedAt: new Date() },
    });

    return { stored, unsupported: false, platform: account.platform };
  }

  /**
   * Broadcast a sentiment alert to every member of the account's team. Includes
   * a short snippet of the offending comment and a direct link to the inbox.
   */
  private async raiseAlert(
    account: { teamId: string; platform: Platform | string; accountName: string },
    comment: { id: string; authorName: string; content: string },
    score: number,
    sentiment: Sentiment,
  ): Promise<void> {
    const snippet = comment.content.replace(/\s+/g, ' ').slice(0, 120);
    const reason =
      sentiment === Sentiment.NEGATIVE ? 'strongly negative' : 'keyword match';
    try {
      await this.notifications.broadcastToTeam(account.teamId, {
        type: 'warning',
        title: `Sentiment alert on ${account.platform}`,
        body: `${comment.authorName || 'Someone'} left a ${reason} comment on ${account.accountName}: "${snippet}"`,
        link: '/engagement',
        metadata: {
          platform: account.platform,
          sentiment,
          score,
          commentExternalId: comment.id,
        },
      });
    } catch (err) {
      // Alerting must never break the ingest pipeline.
      this.logger.warn(
        `Failed to broadcast sentiment alert: ${
          err instanceof Error ? err.message : err
        }`,
      );
    }
  }

  /** List inbox comments for a team with filters + pagination. */
  async listComments(params: ListCommentsParams) {
    const where: Prisma.EngagementCommentWhereInput = {
      account: { teamId: params.teamId },
    };
    if (params.platform) where.platform = params.platform;
    if (params.sentiment) where.sentiment = params.sentiment;
    if (params.unreplied) where.replied = false;

    const [items, total] = await Promise.all([
      this.prisma.engagementComment.findMany({
        where,
        skip: params.skip ?? 0,
        take: params.take ?? DEFAULT_TAKE,
        orderBy: { commentDate: 'desc' },
        include: { account: { select: { platform: true, accountName: true } } },
      }),
      this.prisma.engagementComment.count({ where }),
    ]);

    return { items, total, skip: params.skip ?? 0, take: params.take ?? DEFAULT_TAKE };
  }

  /**
   * Reply to a comment (delegates to the platform adapter), marking it replied
   * regardless so the inbox never re-surfaces it. If the adapter can't reply,
   * we still mark it replied locally and report ok:false.
   */
  async reply(commentId: string, content: string) {
    const comment = await this.prisma.engagementComment.findUnique({
      where: { id: commentId },
    });
    if (!comment) {
      throw new Error(`Comment ${commentId} not found`);
    }

    const outcome = await this.platformSdk.replyToComment(
      comment.accountId,
      comment.platform,
      comment.externalId,
      content,
    );

    await this.prisma.engagementComment.update({
      where: { id: commentId },
      data: {
        replied: true,
        replyContent: content,
        repliedAt: new Date(),
      },
    });

    return { ok: outcome.ok, reason: outcome.reason };
  }

  /** Inbox header stats for a team (totals + per-platform breakdown). */
  async stats(teamId: string): Promise<EngagementStats> {
    const grouped = await this.prisma.engagementComment.groupBy({
      by: ['platform', 'sentiment', 'replied'],
      where: { account: { teamId } },
      _count: { _all: true },
    });

    const byPlatformMap = new Map<
      string,
      { total: number; unreplied: number }
    >();
    let total = 0;
    let unreplied = 0;
    let positive = 0;
    let neutral = 0;
    let negative = 0;

    for (const row of grouped) {
      const count = row._count._all;
      total += count;
      if (!row.replied) unreplied += count;
      if (row.sentiment === Sentiment.POSITIVE) positive += count;
      else if (row.sentiment === Sentiment.NEUTRAL) neutral += count;
      else negative += count;

      const entry = byPlatformMap.get(row.platform) ?? { total: 0, unreplied: 0 };
      entry.total += count;
      if (!row.replied) entry.unreplied += count;
      byPlatformMap.set(row.platform, entry);
    }

    return {
      total,
      unreplied,
      positive,
      neutral,
      negative,
      byPlatform: [...byPlatformMap.entries()].map(([platform, v]) => ({
        platform,
        ...v,
      })),
    };
  }

  /** Resolve the first team a member belongs to (by membership, then owned). */
  async firstTeamForUser(userId: string): Promise<string> {
    const membership = await this.prisma.member.findFirst({
      where: { userId },
      orderBy: { joinedAt: 'asc' },
      select: { teamId: true },
    });
    if (membership) return membership.teamId;

    const owned = await this.prisma.team.findFirst({
      where: { ownerId: userId },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (owned) return owned.id;

    throw new Error(`User ${userId} is not a member of any team`);
  }

  // ── Comment polling (worker) ───────────────────────────────────────

  /**
   * Ingest fresh comments and private messages for every active social account
   * in a team. Used by the polling worker to keep inboxes fresh without a
   * manual trigger. Accounts whose adapter doesn't expose a given surface are
   * skipped gracefully.
   *
   * Returns a summary so callers can log/surface progress.
   */
  async syncTeam(
    teamId: string,
  ): Promise<{ teamId: string; accounts: number; comments: number; messages: number }> {
    const accounts = await this.prisma.socialAccount.findMany({
      where: { teamId, status: 'ACTIVE' },
      select: { id: true },
    });

    let comments = 0;
    let messages = 0;
    for (const acc of accounts) {
      try {
        const c = await this.ingest(acc.id);
        comments += c.stored;
      } catch (err) {
        // One broken account must not stop the rest of the sync.
        this.logger.warn(
          `Comment sync skipped account ${acc.id}: ${
            err instanceof Error ? err.message : err
          }`,
        );
      }
      try {
        const m = await this.ingestMessages(acc.id);
        messages += m.stored;
      } catch (err) {
        this.logger.warn(
          `Message sync skipped account ${acc.id}: ${
            err instanceof Error ? err.message : err
          }`,
        );
      }
    }

    return { teamId, accounts: accounts.length, comments, messages };
  }

  /**
   * Ingest comments and messages for every active account across all teams.
   * Returns one summary per team that had at least one account. Convenience
   * wrapper the worker calls on its tick.
   */
  async syncAllTeams(): Promise<
    { teamId: string; accounts: number; comments: number; messages: number }[]
  > {
    const teams = await this.prisma.socialAccount.findMany({
      where: { status: 'ACTIVE' },
      select: { teamId: true },
      distinct: ['teamId'],
    });

    const results = [];
    for (const t of teams) {
      results.push(await this.syncTeam(t.teamId));
    }
    return results;
  }

  // ── Sentiment keyword alerts ────────────────────────────────────────

  async listKeywords(teamId: string) {
    return this.prisma.sentimentKeyword.findMany({
      where: { teamId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createKeyword(
    teamId: string,
    userId: string,
    keyword: string,
  ): Promise<{ id: string; teamId: string; keyword: string }> {
    const cleaned = String(keyword ?? '').trim();
    if (!cleaned) {
      throw new Error('Keyword must not be empty');
    }
    try {
      const row = await this.prisma.sentimentKeyword.create({
        data: { teamId, keyword: cleaned, createdBy: userId },
      });
      return { id: row.id, teamId: row.teamId, keyword: row.keyword };
    } catch (err) {
      // @@unique([teamId, keyword]) race — surface a friendly message.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new Error(`Keyword "${cleaned}" already exists for this team`);
      }
      throw err;
    }
  }

  async deleteKeyword(id: string, teamId: string) {
    // Ensure the keyword belongs to the caller's team before deleting.
    const row = await this.prisma.sentimentKeyword.findFirst({
      where: { id, teamId },
    });
    if (!row) {
      throw new Error(`Keyword ${id} not found`);
    }
    await this.prisma.sentimentKeyword.delete({ where: { id } });
    return { deleted: true };
  }

  // ── Private messages ───────────────────────────────────────────────

  /**
   * Fetch private messages for a social account from its platform adapter and
   * upsert them into EngagementMessage. Idempotent on (accountId, externalId).
   * Unsupported adapters are recorded as a no-op.
   */
  async ingestMessages(accountId: string) {
    const account = await this.prisma.socialAccount.findUnique({
      where: { id: accountId },
    });
    if (!account) {
      throw new Error(`Social account ${accountId} not found`);
    }

    const result: FetchMessagesResult = await this.platformSdk.fetchMessages(
      accountId,
      account.platform,
    );

    if (result.unsupported) {
      return { stored: 0, unsupported: true, platform: account.platform };
    }

    let stored = 0;
    for (const m of result.items) {
      await this.prisma.engagementMessage.upsert({
        where: {
          accountId_externalId: { accountId, externalId: m.id },
        },
        create: {
          accountId,
          externalId: m.id,
          platform: account.platform,
          conversationId: m.conversationId ?? null,
          authorName: m.authorName,
          authorId: m.authorId ?? null,
          content: m.content,
          sentByMe: m.sentByMe ?? false,
          messageDate: m.createdAt ?? new Date(),
        },
        update: {
          authorName: m.authorName,
          content: m.content,
          conversationId: m.conversationId ?? null,
          sentByMe: m.sentByMe ?? false,
          metadata: { reIngestedAt: new Date().toISOString() },
        },
      });
      stored += 1;
    }

    await this.prisma.socialAccount.update({
      where: { id: accountId },
      data: { lastSyncedAt: new Date() },
    });

    return { stored, unsupported: false, platform: account.platform };
  }

  /** List inbox messages for a team with filters + pagination. */
  async listMessages(params: MessageListParams) {
    const where: Prisma.EngagementMessageWhereInput = {
      account: { teamId: params.teamId },
    };
    if (params.platform) where.platform = params.platform;
    if (params.conversationId) where.conversationId = params.conversationId;
    if (params.sentByMe !== undefined) where.sentByMe = params.sentByMe;

    const [items, total] = await Promise.all([
      this.prisma.engagementMessage.findMany({
        where,
        skip: params.skip ?? 0,
        take: params.take ?? DEFAULT_TAKE,
        orderBy: { messageDate: 'desc' },
        include: { account: { select: { platform: true, accountName: true } } },
      }),
      this.prisma.engagementMessage.count({ where }),
    ]);

    return {
      items,
      total,
      skip: params.skip ?? 0,
      take: params.take ?? DEFAULT_TAKE,
    };
  }

  // ── Quick-reply templates ─────────────────────────────────────────

  async listTemplates(userId: string) {
    return this.prisma.commentTemplate.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createTemplate(userId: string, dto: { title: string; body: string }) {
    return this.prisma.commentTemplate.create({
      data: { userId, title: dto.title, body: dto.body },
    });
  }

  async deleteTemplate(id: string, userId: string) {
    // Ensure ownership before deleting.
    const tpl = await this.prisma.commentTemplate.findFirst({
      where: { id, userId },
    });
    if (!tpl) {
      throw new Error(`Template ${id} not found`);
    }
    await this.prisma.commentTemplate.delete({ where: { id } });
    return { deleted: true };
  }
}
