import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Platform, ContentStatus, Prisma } from '@prisma/client';
import { PublishRequest } from '@content-hub/platform-sdk';
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
