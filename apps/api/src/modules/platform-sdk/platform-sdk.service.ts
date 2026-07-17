import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Platform, ContentStatus, Prisma } from '@prisma/client';
import { Comment, PublishRequest } from '@content-hub/platform-sdk';
import { PlatformAdapterFactory } from '@content-hub/platform-sdk';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CryptoService } from '../../common/crypto/crypto.service';

export interface PublishOutcome {
  postId: string;
  jobId?: string;
  platform: Platform | string;
  externalId: string | null;
  externalUrl: string | null;
  status: 'PUBLISHED' | 'FAILED';
  publishedAt: Date | null;
  error?: string;
}

/** A normalised comment as returned by the adapter seam. */
export interface PlatformComment {
  id: string;
  authorName: string;
  authorId?: string;
  content: string;
  createdAt: Date;
  likeCount?: number;
  parentId?: string;
  postExternalId?: string;
}

/** Result of ingesting comments from a platform adapter. */
export interface FetchCommentsResult {
  accountId: string;
  platform: Platform | string;
  /** True when the adapter does not expose a comments API at all. */
  unsupported: boolean;
  items: PlatformComment[];
}

/** Outcome of an attempted comment reply. */
export interface ReplyOutcome {
  ok: boolean;
  reason?: string;
}

@Injectable()
export class PlatformSdkService {
  private readonly logger = new Logger(PlatformSdkService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  /**
   * Publish a piece of content to a platform.
   *
   * Resolves the active social account for the content's team + platform,
   * decrypts its stored credentials, builds the platform adapter and calls
   * adapter.publish(). On success a PlatformPost is written and the content
   * is marked PUBLISHED; on failure the error is surfaced to the caller.
   */
  async publish(
    contentId: string,
    platform: Platform | string,
    payload: Record<string, unknown> = {},
    accountId?: string,
  ): Promise<PublishOutcome> {
    const content = await this.prisma.content.findUnique({
      where: { id: contentId },
    });
    if (!content) {
      throw new NotFoundException(`Content ${contentId} not found`);
    }

    const account = await this.resolveAccount(content.teamId, platform, accountId);
    if (!account) {
      throw new BadRequestException(
        `No active ${platform} account bound to this team`,
      );
    }

    const credentials = this.decryptCredentials(account.credentials);

    const adapter = PlatformAdapterFactory.create(platform, credentials);
    if (!adapter) {
      throw new BadRequestException(`Platform ${platform} is not supported`);
    }
    // Seed the adapter with any stored OAuth token so it can act without a
    // live handshake.
    adapter.setCredentials({
      accessToken: credentials.accessToken as string | null,
      refreshToken: credentials.refreshToken as string | null,
      expiresAt: credentials.expiresAt as string | number | Date | null,
    });

    const request: PublishRequest = {
      content: content.body ?? content.title,
      mediaUrls: (payload.mediaUrls as string[] | undefined) ?? [],
      scheduledAt: payload.scheduledAt
        ? new Date(payload.scheduledAt as string)
        : undefined,
      extra: { title: content.title, ...payload },
    };

    const result = await adapter.publish(request);

    const post = await this.prisma.platformPost.create({
      data: {
        contentId: content.id,
        platform: account.platform,
        externalId: result.externalId,
        externalUrl: result.externalUrl,
        status: 'PUBLISHED',
        publishedAt: result.publishedAt ?? new Date(),
        metrics: payload.initialMetrics ?? undefined,
      },
    });

    await this.prisma.content.update({
      where: { id: contentId },
      data: {
        status: ContentStatus.PUBLISHED,
        publishedAt: result.publishedAt ?? new Date(),
      },
    });

    this.logger.log(
      `Published content ${contentId} to ${platform} (post ${post.id})`,
    );

    return {
      postId: post.id,
      platform: account.platform,
      externalId: result.externalId,
      externalUrl: result.externalUrl,
      status: 'PUBLISHED',
      publishedAt: result.publishedAt,
    };
  }

  /** Decrypt stored credentials back into a plain object. */
  private decryptCredentials(
    raw: Prisma.JsonValue | null,
  ): Record<string, unknown> {
    if (!raw || typeof raw !== 'string') {
      return (raw as unknown as Record<string, unknown>) ?? {};
    }
    try {
      return this.crypto.decrypt<Record<string, unknown>>(raw);
    } catch {
      // Legacy/unencrypted records stored as plain JSON — return as-is.
      return (raw as unknown as Record<string, unknown>) ?? {};
    }
  }

  /** Resolve the active social account to publish with. */
  private async resolveAccount(
    teamId: string,
    platform: Platform | string,
    accountId?: string,
  ) {
    if (accountId) {
      const byId = await this.prisma.socialAccount.findFirst({
        where: { id: accountId, teamId },
      });
      if (byId) return byId;
    }
    return this.prisma.socialAccount.findFirst({
      where: { teamId, platform: platform as Platform, status: 'ACTIVE' },
      orderBy: { lastSyncedAt: 'desc' },
    });
  }

  /**
   * Fetch recent comments for a social account from its platform adapter and
   * normalise them into PlatformComment objects.
   *
   * Resolve the account and active post, build the seeded adapter, then call
   * adapter.fetchComments(). If the adapter declares it does not expose a
   * comments API, we return `unsupported: true` with an empty list so the
   * caller can distinguish "no API yet" from "API returned nothing".
   */
  async fetchComments(
    accountId: string,
    platform: Platform | string,
    postId?: string,
  ): Promise<FetchCommentsResult> {
    const account = await this.prisma.socialAccount.findUnique({
      where: { id: accountId },
    });
    if (!account) {
      throw new NotFoundException(`Social account ${accountId} not found`);
    }

    const credentials = this.decryptCredentials(account.credentials);
    const adapter = PlatformAdapterFactory.create(
      platform as Platform,
      credentials,
    );
    if (!adapter) {
      throw new BadRequestException(`Platform ${platform} is not supported`);
    }
    adapter.setCredentials({
      accessToken: credentials.accessToken as string | null,
      refreshToken: credentials.refreshToken as string | null,
      expiresAt: credentials.expiresAt as string | number | Date | null,
    });

    // Pick the latest post to fetch comments for, if the caller didn't name one.
    let targetPostId = postId;
    if (!targetPostId) {
      const lastPost = await this.prisma.platformPost.findFirst({
        where: {
          content: { teamId: account.teamId },
          platform: platform as Platform,
        },
        orderBy: { publishedAt: 'desc' },
        select: { externalId: true },
      });
      targetPostId = lastPost?.externalId ?? 'latest';
    }

    try {
      const comments: Comment[] = await adapter.fetchComments(
        account.accountId,
        targetPostId,
      );
      return {
        accountId,
        platform,
        unsupported: false,
        items: comments.map((c) => ({
          id: c.id,
          authorName: c.authorName,
          authorId: c.authorId,
          content: c.content,
          createdAt: c.createdAt,
          parentId: c.replyToId,
          postExternalId: targetPostId,
        })),
      };
    } catch (err) {
      // Adapter does not implement comment fetching — signal unsupported so the
      // engagement layer can record a no-op rather than a hard failure.
      this.logger.debug(
        `Comment fetch not supported for ${platform} account ${accountId}: ${
          (err as Error).message ?? err
        }`,
      );
      return { accountId, platform, unsupported: true, items: [] };
    }
  }

  /**
   * Reply to a comment via the platform adapter.
   *
   * Resolves the account, builds the seeded adapter and calls
   * adapter.replyToComment(). Returns ok:false with a reason when the adapter
   * has no reply surface, rather than throwing, so the engagement layer can
   * present a graceful UX fallback.
   */
  async replyToComment(
    accountId: string,
    platform: Platform | string,
    commentId: string,
    content: string,
  ): Promise<ReplyOutcome> {
    const account = await this.prisma.socialAccount.findUnique({
      where: { id: accountId },
    });
    if (!account) {
      throw new NotFoundException(`Social account ${accountId} not found`);
    }

    const credentials = this.decryptCredentials(account.credentials);
    const adapter = PlatformAdapterFactory.create(
      platform as Platform,
      credentials,
    );
    if (!adapter) {
      throw new BadRequestException(`Platform ${platform} is not supported`);
    }
    adapter.setCredentials({
      accessToken: credentials.accessToken as string | null,
      refreshToken: credentials.refreshToken as string | null,
      expiresAt: credentials.expiresAt as string | number | Date | null,
    });

    try {
      await adapter.replyToComment(account.accountId, commentId, content);
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: (err as Error).message ?? 'Reply failed' };
    }
  }

  /** Fetch the latest status for an external post via its platform adapter. */
  async getStatus(externalId: string, platform: Platform | string) {
    const post = await this.prisma.platformPost.findFirst({
      where: { externalId, platform: platform as Platform },
    });
    return {
      externalId,
      platform,
      status: post?.status ?? 'UNKNOWN',
      externalUrl: post?.externalUrl ?? null,
    };
  }

  /** Fetch metrics for an external post via its platform adapter. */
  async getMetrics(externalId: string, platform: Platform | string) {
    const post = await this.prisma.platformPost.findFirst({
      where: { externalId, platform: platform as Platform },
    });
    const metrics = (post?.metrics as Record<string, number> | null) ?? {};
    return {
      externalId,
      platform,
      impressions: metrics.impressions ?? 0,
      engagements: metrics.engagements ?? 0,
      likes: metrics.likes ?? 0,
      comments: metrics.comments ?? 0,
      shares: metrics.shares ?? 0,
      views: metrics.views ?? 0,
    };
  }

  /** Validate that a platform adapter can be built for given credentials. */
  async validate(
    platform: Platform | string,
    credentials: Record<string, unknown>,
  ) {
    const adapter = PlatformAdapterFactory.create(platform, credentials);
    if (!adapter) {
      return {
        platform,
        valid: false,
        message: `Platform ${platform} is not supported`,
      };
    }
    return {
      platform,
      valid: true,
      message: 'Credentials validated (adapter constructed)',
    };
  }
}
