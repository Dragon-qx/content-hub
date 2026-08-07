import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Platform, ContentStatus, Prisma } from '@prisma/client';
import { Comment, Message, PublishRequest, PublishResult } from '@content-hub/platform-sdk';
import { PlatformAdapterFactory } from '@content-hub/platform-sdk';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CryptoService } from '../../common/crypto/crypto.service';
import { AdaptationService } from '../adaptation/adaptation.service';
import { TeamAccessService } from '../common/team-access/team-access.service';

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

/** A normalised private message as returned by the adapter seam. */
export interface PlatformMessage {
  id: string;
  authorName: string;
  authorId?: string;
  content: string;
  createdAt: Date;
  conversationId?: string;
  sentByMe?: boolean;
}

/** Result of ingesting private messages from a platform adapter. */
export interface FetchMessagesResult {
  accountId: string;
  platform: Platform | string;
  /** True when the adapter does not expose a messages API at all. */
  unsupported: boolean;
  items: PlatformMessage[];
}

@Injectable()
export class PlatformSdkService {
  private readonly logger = new Logger(PlatformSdkService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly adaptation: AdaptationService,
    private readonly teamAccess: TeamAccessService,
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
    userId?: string,
  ): Promise<PublishOutcome> {
    const content = await this.prisma.content.findFirst({
      where: { id: contentId },
    });
    if (!content) {
      throw new NotFoundException(`Content ${contentId} not found`);
    }

    // Verify user has access to the content's team
    if (userId) {
      await this.teamAccess.assertUserInTeam(userId, content.teamId);
    }

    // Idempotency check: if already published to this platform, return existing post
    const existingPost = await this.prisma.platformPost.findFirst({
      where: { contentId, platform: platform as Platform },
    });
    if (existingPost) {
      this.logger.log(`Content ${contentId} already published to ${platform} (post ${existingPost.id}) — idempotent return`);
      return {
        postId: existingPost.id,
        platform: existingPost.platform,
        externalId: existingPost.externalId,
        externalUrl: existingPost.externalUrl,
        status: 'PUBLISHED',
        publishedAt: existingPost.publishedAt,
      };
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

    // Step ④ of the publish pipeline (PRD §3.4): adapt the copy to the target
    // platform's limits before it leaves for the adapter. Unknown platforms
    // fall through unchanged. Truncation is logged as a warning so the author
    // can shorten the draft manually if the ellipsis is undesirable.
    const rawBody = content.body ?? content.title;
    const adapted = this.adaptation.adaptForPublish(account.platform, rawBody);
    const publishBody = adapted?.adaptedBody ?? rawBody;
    if (adapted?.warnings.length) {
      this.logger.warn(
        `Content ${contentId} adapted for ${account.platform}: ${adapted.warnings.join('; ')}`,
      );
    }

    const request: PublishRequest = {
      content: publishBody,
      mediaUrls: (payload.mediaUrls as string[] | undefined) ?? [],
      scheduledAt: payload.scheduledAt
        ? new Date(payload.scheduledAt as string)
        : undefined,
      extra: { title: content.title, ...payload },
    };

    let result: PublishResult;
    try {
      result = await adapter.publish(request);
    } catch (err: unknown) {
      // Classify errors: network/timeout = retryable, auth/validation = permanent
      const msg = err instanceof Error ? err.message.toLowerCase() : '';
      const retryable = msg.includes('timeout') || msg.includes('econnrefused') ||
        msg.includes('enotfound') || msg.includes('network') || msg.includes('429') ||
        msg.includes('503') || msg.includes('502') || msg.includes('504');
      this.logger.warn(`Publish to ${platform} failed (${retryable ? 'retryable' : 'permanent'}): ${err instanceof Error ? err.message : err}`);
      throw err;
    }

    // Wrap DB writes in a transaction so PlatformPost + Content are atomic
    try {
      const post = await this.prisma.$transaction(async (tx) => {
        const newPost = await tx.platformPost.create({
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

        await tx.content.update({
          where: { id: contentId },
          data: {
            status: ContentStatus.PUBLISHED,
            publishedAt: result.publishedAt ?? new Date(),
          },
        });

        return newPost;
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
    } catch (dbErr: unknown) {
      // Platform succeeded but DB write failed — log for manual reconciliation
      // The idempotency check at the top will handle retries gracefully
      this.logger.error(
        `CRITICAL: Platform publish succeeded but DB write failed for content ${contentId} on ${platform}. ` +
        `External ID: ${result.externalId}. Manual reconciliation may be needed.`,
      );
      throw dbErr;
    }
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
    } catch (err) {
      // Legacy/unencrypted records were once stored as plain JSON. Returning
      // them as-is keeps migration working, but log so a genuine decrypt
      // failure (e.g. key rotation) isn't swallowed silently.
      this.logger.debug(
        `Credentials could not be decrypted (legacy/plain-JSON fallback): ${
          err instanceof Error ? err.message : err
        }`,
      );
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

  /**
   * Fetch recent private messages for a social account from its platform
   * adapter and normalise them into PlatformMessage objects.
   *
   * Resolves the account, builds the seeded adapter, then calls
   * adapter.fetchMessages(). If the adapter declares it does not expose a
   * messages API, we return `unsupported: true` with an empty list so the
   * caller can distinguish "no API yet" from "API returned nothing".
   */
  async fetchMessages(
    accountId: string,
    platform: Platform | string,
  ): Promise<FetchMessagesResult> {
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
      const messages: Message[] = await adapter.fetchMessages(
        account.accountId,
      );
      return {
        accountId,
        platform,
        unsupported: false,
        items: messages.map((m) => ({
          id: m.id,
          authorName: m.authorName,
          authorId: m.authorId,
          content: m.content,
          createdAt: m.createdAt,
          conversationId: m.conversationId,
          sentByMe: m.sentByMe,
        })),
      };
    } catch (err) {
      // Adapter does not implement private messaging — signal unsupported so the
      // engagement layer can record a no-op rather than a hard failure.
      this.logger.debug(
        `Message fetch not supported for ${platform} account ${accountId}: ${
          (err as Error).message ?? err
        }`,
      );
      return { accountId, platform, unsupported: true, items: [] };
    }
  }

  /**
   * Reply to a private message via the platform adapter.
   *
   * Resolves the account, builds the seeded adapter and calls
   * adapter.replyToMessage(). Returns ok:false with a reason when the adapter
   * has no message-reply surface, rather than throwing, so the engagement
   * layer can present a graceful UX fallback.
   */
  async replyToMessage(
    accountId: string,
    platform: Platform | string,
    messageId: string,
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
      await adapter.replyToMessage(account.accountId, messageId, content);
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
  /** Validate that a platform adapter can be built for given credentials. */
  async validate(
    platform: Platform | string,
    credentials: Record<string, unknown>,
  ) {
    const adapter = PlatformAdapterFactory.create(platform, credentials);
    if (!adapter) {
      return { platform, valid: false, message: `Platform ${platform} is not supported` };
    }
    return { platform, valid: true, message: 'Credentials validated (adapter constructed)' };
  }

  /**
   * Validate raw credentials before binding/editing an account.
   * Builds the adapter, calls validateCredentials(), and returns structured
   * result with fix suggestions — same shape as validateAccount().
   */
  async validateRaw(
    platform: Platform | string,
    credentials: Record<string, unknown>,
  ): Promise<{
    platform: string;
    valid: boolean;
    message: string;
    checks: { name: string; ok: boolean; detail: string }[];
    suggestions: string[];
  }> {
    const checks: { name: string; ok: boolean; detail: string }[] = [];
    const suggestions: string[] = [];

    const adapter = PlatformAdapterFactory.create(platform, credentials);
    const adapterOk = !!adapter;
    checks.push({
      name: '适配器构建',
      ok: adapterOk,
      detail: adapterOk ? `${platform} 适配器已构建` : '平台不支持或凭证格式错误',
    });
    if (!adapterOk) {
      suggestions.push(`平台 ${platform} 不支持，请检查平台名称和必要字段`);
      return { platform: String(platform), valid: false, message: '平台不支持或凭证格式错误', checks, suggestions };
    }

    // Check required fields per platform
    const requiredMap: Record<string, string[]> = {
      WECHAT_OFFICIAL: ['appid', 'secret'],
      WECHAT_VIDEO: ['appid', 'secret'],
      DOUYIN: ['clientKey', 'clientSecret'],
      XIAOHONGSHU: ['appKey', 'appSecret'],
      BILIBILI: ['accessKey'],
      WEIBO: ['appKey', 'appSecret'],
      TWITTER: ['apiKey', 'apiSecret'],
      YOUTUBE: ['clientId', 'clientSecretYouTube'],
    };
    const required = requiredMap[platform] ?? [];
    const missing = required.filter((k) => !credentials[k]);
    const fieldsOk = missing.length === 0;
    checks.push({
      name: '必填字段',
      ok: fieldsOk,
      detail: fieldsOk ? '已填写' : `缺少: ${missing.join(', ')}`,
    });
    if (!fieldsOk) {
      suggestions.push(`请填写必填字段: ${missing.join(', ')}`);
    }

    // Try API validation
    let apiOk = false;
    let apiDetail = '未检测';
    if (fieldsOk) {
      adapter.setCredentials({
        accessToken: credentials.accessToken as string | null,
        refreshToken: credentials.refreshToken as string | null,
        expiresAt: credentials.expiresAt as string | number | Date | null,
      });
      try {
        apiOk = await adapter.validateCredentials();
        apiDetail = apiOk ? 'API 验证通过' : 'API 返回凭证无效';
      } catch (err: unknown) {
        apiDetail = err instanceof Error ? err.message : 'API 调用失败';
        const msg = apiDetail.toLowerCase();
        if (msg.includes('401') || msg.includes('unauthorized') || msg.includes('invalid') || msg.includes('appid') || msg.includes('40013')) {
          suggestions.push('AppID 或 Secret 不正确，请检查后重试');
        } else if (msg.includes('403') || msg.includes('forbidden')) {
          suggestions.push('API 权限不足，请在开发者后台开通权限');
        } else if (msg.includes('network') || msg.includes('enotfound') || msg.includes('timeout') || msg.includes('econnrefused')) {
          suggestions.push('网络连接失败，请检查网络或稍后重试');
        } else if (msg.includes('expired')) {
          suggestions.push('Token 已过期，请重新授权');
        } else {
          suggestions.push(`API 错误: ${apiDetail}`);
        }
      }
    }
    checks.push({ name: 'API 验证', ok: apiOk, detail: apiDetail });
    if (!apiOk && suggestions.length === 0) {
      suggestions.push('凭证验证失败，请检查填写是否正确');
    }

    const valid = adapterOk && fieldsOk && apiOk;
    return {
      platform: String(platform),
      valid,
      message: valid ? '凭证有效，可以保存' : '凭证存在问题，请根据建议修复',
      checks,
      suggestions,
    };
  }

  /**
   * Deep-validate a stored social account by id.
   *
   * Decrypts the account's stored credentials, builds the platform adapter,
   * seeds it with any stored OAuth token, then calls adapter.validateCredentials()
   * (when the adapter exposes one) to confirm the credentials actually work
   * against the platform's API. Returns a structured result with fix suggestions
   * for the most common failure modes.
   */
  async validateAccount(accountId: string): Promise<{
    accountId: string;
    platform: string;
    valid: boolean;
    status: string;
    message: string;
    checks: { name: string; ok: boolean; detail: string }[];
    suggestions: string[];
  }> {
    const account = await this.prisma.socialAccount.findUnique({
      where: { id: accountId },
    });
    if (!account) {
      return {
        accountId,
        platform: '',
        valid: false,
        status: 'NOT_FOUND',
        message: '账号不存在',
        checks: [],
        suggestions: ['请确认账号 ID 是否正确'],
      };
    }

    const checks: { name: string; ok: boolean; detail: string }[] = [];
    const suggestions: string[] = [];

    // Check 1: status is ACTIVE
    const statusOk = account.status === 'ACTIVE';
    checks.push({ name: '账号状态', ok: statusOk, detail: statusOk ? 'ACTIVE' : `当前状态: ${account.status}` });
    if (!statusOk) {
      suggestions.push('账号状态异常，请重新绑定或激活账号');
    }

    // Check 2: credentials exist
    const credentials = this.decryptCredentials(account.credentials);
    const hasCreds = credentials && Object.keys(credentials).length > 0;
    checks.push({ name: '凭证存在', ok: hasCreds, detail: hasCreds ? '已存储' : '未找到凭证' });
    if (!hasCreds) {
      suggestions.push('凭证缺失，请重新绑定账号并填写完整的 AppID 和 Secret');
    }

    // Check 3: adapter can be constructed
    const adapter = PlatformAdapterFactory.create(account.platform, credentials);
    const adapterOk = !!adapter;
    checks.push({ name: '适配器构建', ok: adapterOk, detail: adapterOk ? `${account.platform} 适配器已构建` : '平台不支持' });
    if (!adapterOk) {
      suggestions.push(`平台 ${account.platform} 暂不支持，请联系管理员`);
    }

    // Check 4: try to validate credentials against platform API
    let apiOk = false;
    let apiDetail = '未检测';
    if (adapter) {
      adapter.setCredentials({
        accessToken: credentials.accessToken as string | null,
        refreshToken: credentials.refreshToken as string | null,
        expiresAt: credentials.expiresAt as string | number | Date | null,
      });
      try {
        apiOk = await adapter.validateCredentials();
        apiDetail = apiOk ? 'API 验证通过' : 'API 返回凭证无效';
      } catch (err: unknown) {
        apiDetail = err instanceof Error ? err.message : 'API 调用失败';
        const msg = apiDetail.toLowerCase();
        if (msg.includes('401') || msg.includes('unauthorized') || msg.includes('invalid') || msg.includes('appid')) {
          suggestions.push('AppID 或 Secret 不正确，请检查后重新绑定');
        } else if (msg.includes('403') || msg.includes('forbidden')) {
          suggestions.push('API 权限不足，请在公众号后台开通开发者权限');
        } else if (msg.includes('network') || msg.includes('enotfound') || msg.includes('timeout') || msg.includes('econnrefused')) {
          suggestions.push('网络连接失败，请检查服务器网络或代理设置');
        } else if (msg.includes('expired')) {
          suggestions.push('Token 已过期，请重新授权');
        } else {
          suggestions.push(`API 错误: ${apiDetail}`);
        }
      }
    }
    checks.push({ name: 'API 验证', ok: apiOk, detail: apiDetail });
    if (!apiOk && suggestions.length === 0) {
      suggestions.push('凭证验证失败，请检查 AppID/Secret 是否正确');
    }

    const valid = statusOk && hasCreds && adapterOk && apiOk;
    return {
      accountId,
      platform: account.platform,
      valid,
      status: account.status,
      message: valid ? '账号正常，可以发布' : '账号存在问题，请根据建议修复',
      checks,
      suggestions,
    };
  }
}
