import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountStatus,
  Platform,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CryptoService } from '../../common/crypto/crypto.service';
import { OauthStatePayload } from '../../common/crypto/crypto.service';
import { PlatformAdapterFactory } from '@content-hub/platform-sdk';
import { BindAccountDto } from './dto/account.dto';
import { AccountImportRecord } from './dto/import-accounts.dto';
import { OAuthAuthorizeDto } from './dto/oauth.dto';
import { credentialsFromRecord, parseCsv } from './csv-parser';
import { WechatOfficialAdapter } from '@content-hub/platform-sdk';

/**
 * A single normalised CSV import row, after the header record is stripped.
 * `Accepts both the per-column credential keys and an optional JSON blob.
 */
export interface AccountImportRow {
  platform: string;
  accountId: string;
  accountName: string;
  accountHandle?: string;
  credentials?: Record<string, unknown>;
}

/** Per-row outcome of a batch import — either a bound account or an error. */
export interface ImportRowResult {
  /** Source line number (1-based from the first data row), when available. */
  line?: number;
  status: 'ok' | 'error';
  account?: PublicAccount;
  error?: string;
}

/** Aggregate summary returned by `batchImport`. */
export interface BatchImportSummary {
  total: number;
  succeeded: number;
  failed: number;
  results: ImportRowResult[];
}

const PUBLIC_SELECT = {
  id: true,
  teamId: true,
  platform: true,
  accountId: true,
  accountName: true,
  accountHandle: true,
  status: true,
  followerCount: true,
  followingCount: true,
  postCount: true,
  lastSyncedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

export type PublicAccount = Prisma.SocialAccountGetPayload<{
  select: typeof PUBLIC_SELECT;
}>;

@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  /** Decrypt stored credentials back into a plain object. */
  private decryptCredentials(raw: Prisma.JsonValue | null): Record<string, unknown> {
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

  /**
   * List accounts for a team, paged. Returns a `Paginated` envelope so the
   * frontend can render the list and total without a second request.
   */
  async listForTeam(
    teamId: string,
    { skip, take }: { skip?: number; take?: number } = {},
  ) {
    const where = { teamId };
    const [items, total] = await Promise.all([
      this.prisma.socialAccount.findMany({
        where,
        select: PUBLIC_SELECT,
        skip: skip ?? 0,
        take: take ?? 20,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.socialAccount.count({ where }),
    ]);
    return { items, total, skip: skip ?? 0, take: take ?? 20 };
  }

  /** List accounts across all of a user's teams, paged. */
  async listForUser(
    userId: string,
    { skip, take }: { skip?: number; take?: number } = {},
  ) {
    const memberships = await this.prisma.member.findMany({
      where: { userId },
      select: { teamId: true },
    });
    const teamIds = memberships.map((m) => m.teamId);
    if (teamIds.length === 0) {
      return { items: [], total: 0, skip: skip ?? 0, take: take ?? 20 };
    }
    const where = { teamId: { in: teamIds } };
    const [items, total] = await Promise.all([
      this.prisma.socialAccount.findMany({
        where,
        select: PUBLIC_SELECT,
        skip: skip ?? 0,
        take: take ?? 20,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.socialAccount.count({ where }),
    ]);
    return { items, total, skip: skip ?? 0, take: take ?? 20 };
  }

  async get(id: string): Promise<PublicAccount> {
    const account = await this.prisma.socialAccount.findUnique({
      where: { id },
      select: PUBLIC_SELECT,
    });
    if (!account) {
      throw new NotFoundException('Account not found');
    }
    return account;
  }

  // 根据平台自动组合 credentials JSON
  private composeCredentials(dto: BindAccountDto): Record<string, unknown> {
    const p = dto.platform;
    let creds: Record<string, unknown> = {};

    if (p === Platform.WECHAT_OFFICIAL || p === Platform.WECHAT_VIDEO) {
      creds = {
        type: 'wechat_official',
        appid: dto.appid || '',
        secret: dto.secret || '',
        rawId: dto.rawId || '',
      };
    } else if (p === Platform.DOUYIN) {
      creds = {
        type: 'douyin',
        clientKey: dto.clientKey || '',
        clientSecret: dto.clientSecret || '',
        callbackUrl: dto.callbackUrl || '',
      };
    } else if (p === Platform.XIAOHONGSHU || p === Platform.WEIBO) {
      creds = {
        type: p === Platform.XIAOHONGSHU ? 'xiaohongshu' : 'weibo',
        appKey: dto.appKey || '',
        appSecret: dto.appSecret || '',
      };
    } else if (p === Platform.BILIBILI) {
      creds = {
        type: 'bilibili',
        appKey: dto.appKey || '',
        accessKey: dto.accessKey || '',
        secretKey: dto.appSecret || '',
      };
    } else if (p === Platform.TWITTER) {
      creds = {
        type: 'twitter',
        bearerToken: dto.bearerToken || '',
        apiKey: dto.apiKey || '',
        apiSecret: dto.apiSecret || '',
      };
    } else if (p === Platform.YOUTUBE) {
      creds = {
        type: 'youtube',
        clientId: dto.clientId || '',
        clientSecret: dto.clientSecretYouTube || '',
        channelId: dto.channelId || '',
      };
    }

    // 如果前端直接传入了结构化的 credentials JSON，直接使用它
    if (dto.credentials && Object.keys(dto.credentials).length > 0) {
      creds = { ...creds, ...dto.credentials };
    }

    return creds;
  }

  async bind(teamId: string, dto: BindAccountDto): Promise<PublicAccount> {
    if (!Object.values(Platform).includes(dto.platform as Platform)) {
      throw new BadRequestException('Unsupported platform');
    }

    // Validate the team exists before we hit Prisma's FK constraint — otherwise
    // the raw database error leaks to the client as a 500 with no useful detail.
    const team = await this.prisma.team.findUnique({ where: { id: teamId } });
    if (!team) {
      throw new NotFoundException('Team not found — please refresh and select a valid team');
    }

    const existing = await this.prisma.socialAccount.findUnique({
      where: {
        platform_accountId: { platform: dto.platform, accountId: dto.accountId },
      },
    });
    if (existing) {
      throw new BadRequestException('This social account is already bound');
    }

    // Credentials are encrypted at rest (AES-256-GCM) before persistence.
    const credentials = this.crypto.encrypt(this.composeCredentials(dto));

    return this.prisma.socialAccount.create({
      data: {
        teamId,
        platform: dto.platform,
        accountId: dto.accountId,
        accountName: dto.accountName,
        accountHandle: dto.accountHandle,
        credentials: credentials as unknown as Prisma.InputJsonValue,
        status: AccountStatus.ACTIVE,
      },
      select: PUBLIC_SELECT,
    });
  }

  async sync(id: string) {
    const account = await this.prisma.socialAccount.findUnique({
      where: { id },
    });
    if (!account) {
      throw new NotFoundException('Account not found');
    }

    // 微信公众号：调用真实 API
    if (
      account.platform === Platform.WECHAT_OFFICIAL &&
      account.credentials
    ) {
      const creds = this.decryptCredentials(account.credentials);
      if (creds.appid && creds.secret) {
        try {
          const adapter = new WechatOfficialAdapter({
            appid: creds.appid as string,
            secret: creds.secret as string,
            rawId: (creds.rawId as string) || account.accountId,
          });
          // 验证并获取 token
          const token = await adapter.getAccessToken();
          // 获取粉丝数
          const followerCount = await adapter.getFollowerCount();
          // 更新数据库
          const updated = await this.prisma.socialAccount.update({
            where: { id },
            data: {
              followerCount: followerCount,
              lastSyncedAt: new Date(),
            },
            select: PUBLIC_SELECT,
          });
          return {
            success: true,
            platform: account.platform,
            accessTokenObtained: !!token,
            followerCount: followerCount,
            account: updated,
          };
        } catch (err) {
          this.logger.warn(`WeChat sync failed for ${id}: ${err.message}`);
          const msg = err.message?.includes('48001') ? '公众号未认证，该功能需要微信认证公众号' : `微信 API 调用失败: ${err.message}`;
          throw new BadRequestException(msg);
        }
      }
    }

    // 其他平台暂不支持实时同步
    return {
      success: false,
      message: `${account.platform} 暂不支持实时同步`,
    };
  }

  /**
   * Update mutable account fields. When new platform credentials are supplied
   * they are merged over the (decrypted) existing credentials and re-encrypted
   * before persistence.
   */
  async update(id: string, dto: Partial<BindAccountDto>): Promise<PublicAccount> {
    const existing = await this.prisma.socialAccount.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Account not found');
    }

    const data: Prisma.SocialAccountUpdateInput = {};
    if (dto.accountName !== undefined) data.accountName = dto.accountName;
    if (dto.accountHandle !== undefined) data.accountHandle = dto.accountHandle;
    if (dto.credentials && Object.keys(dto.credentials).length > 0) {
      const merged = { ...this.decryptCredentials(existing.credentials), ...dto.credentials };
      data.credentials = this.crypto.encrypt(merged) as unknown as Prisma.InputJsonValue;
    }

    return this.prisma.socialAccount.update({
      where: { id },
      data,
      select: PUBLIC_SELECT,
    });
  }

  async unbind(id: string) {
    await this.get(id);
    await this.prisma.socialAccount.delete({ where: { id } });
    return { deleted: true, id };
  }

  // ── Batch import ──────────────────────────────────────────────────────
  // Two front-ends consume this core:
  //   1. POST /accounts/import        — multipart CSV upload (controller
  //      parses, normalises, then calls `batchImport` with the row list)
  //   2. POST /accounts/import/json   — JSON body with a pre-validated
  //      `AccountImportRecord[]` array (already class-validated by the DTO)
  //
  // `batchImport` never throws on a single bad row — it records the failure
  // in `results` and continues, so a 99-row import with one typo still binds
  // the other 98 and reports exactly which row failed.

  /**
   * Validate and bind a single import row. Returns either a `PublicAccount`
   * on success or a string error reason on failure. Never throws.
   */
  private async importOne(
    teamId: string,
    row: AccountImportRow,
  ): Promise<{ account?: PublicAccount; error?: string }> {
    const { platform, accountId, accountName } = row;

    if (!platform || !accountId || !accountName) {
      return { error: 'platform, accountId and accountName are required' };
    }
    if (!Object.values(Platform).includes(platform as Platform)) {
      return { error: `Unsupported platform: ${platform}` };
    }
    if (accountId.trim().length === 0 || accountName.trim().length === 0) {
      return { error: 'accountId and accountName must not be blank' };
    }

    const existing = await this.prisma.socialAccount.findUnique({
      where: { platform_accountId: { platform: platform as Platform, accountId } },
    });
    if (existing) {
      return { error: `${platform} account ${accountId} is already bound` };
    }

    try {
      const credentials = this.crypto.encrypt(
        this.composeCredentials({
          platform: platform as Platform,
          credentials: row.credentials,
        } as BindAccountDto),
      );
      const account = await this.prisma.socialAccount.create({
        data: {
          teamId,
          platform: platform as Platform,
          accountId,
          accountName,
          accountHandle: row.accountHandle,
          credentials: credentials as unknown as Prisma.InputJsonValue,
          status: AccountStatus.ACTIVE,
        },
        select: PUBLIC_SELECT,
      });
      return { account };
    } catch (err) {
      this.logger.warn(`Batch import row failed: ${err?.message ?? err}`);
      return { error: err?.message ?? 'Failed to persist account' };
    }
  }

  /**
   * Batch-bind many accounts under a single team. Each row is validated and
   * bound independently. Returns an aggregate summary plus a per-row `results`
   // array so the controller can report partial success.
   */
  async batchImport(
    teamId: string,
    rows: AccountImportRow[],
  ): Promise<BatchImportSummary> {
    const results: ImportRowResult[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const { account, error } = await this.importOne(teamId, row);
      if (account) {
        results.push({ line: i + 1, status: 'ok', account });
      } else {
        results.push({ line: i + 1, status: 'error', error });
      }
    }

    return {
      total: rows.length,
      succeeded: results.filter((r) => r.status === 'ok').length,
      failed: results.filter((r) => r.status === 'error').length,
      results,
    };
  }

  /**
   * Parse a CSV upload into import rows. Thin wrapper around the pure
   // `parseCsv` + `credentialsFromRecord` helpers so the controller stays
   // a single line. CSV-format errors (ragged rows) are collected on the
   // returned summary as line-0 failures; content-level errors surface after
   // binding via `batchImport`.
   */
  parseImportCsv(
    csv: string,
  ): { rows: AccountImportRow[]; parseErrors: ImportRowResult[] } {
    const { rows, errors } = parseCsv(csv);
    const parseErrors: ImportRowResult[] = errors.map((e) => ({
      line: e.line,
      status: 'error',
      error: e.reason,
    }));
    const importRows: AccountImportRow[] = rows.map((rec) => ({
      platform: String(rec.platform ?? '').trim(),
      accountId: String(rec.accountId ?? '').trim(),
      accountName: String(rec.accountName ?? '').trim(),
      accountHandle: rec.accountHandle ? String(rec.accountHandle).trim() : undefined,
      credentials: credentialsFromRecord(String(rec.platform ?? ''), rec),
    }));
    return { rows: importRows, parseErrors };
  }

  // ── OAuth2 authorization-code flow ────────────────────────────────────
  // Platform adapters already implement getAuthUrl(state) + handleCallback(code),
  // but until now nothing exposed them: binding was "paste raw credentials".
  // These two methods drive the redirect flow instead.
  //
  //   1. authorizeOAuth()  → seal context in a signed `state`, return authUrl
  //   2. browser visits provider → redirects back with ?code=&state=
  //   3. callbackOAuth()    → open state, exchange code, bind the account
  //
  // The callback arrives in the user's browser with no JWT, so all context it
  // needs (who/which team/which app) rides inside the sealed state token.

  /** Map a uniform app-key/secret pair onto the aliases each adapter reads. */
  private oauthAdapterConfig(appKey: string, appSecret: string) {
    return {
      appKey,
      appSecret,
      appid: appKey,
      secret: appSecret,
      clientKey: appKey,
      clientSecret: appSecret,
      accessKey: appKey,
      secretKey: appSecret,
    };
  }

  /**
   * Step 1 — build the provider authorize URL. The returned `state` is a
   * short-lived, tamper-proof token that the callback uses to recover context.
   */
  authorizeOAuth(dto: OAuthAuthorizeDto, userId: string): {
    authUrl: string;
    state: string;
  } {
    if (!Object.values(Platform).includes(dto.platform as Platform)) {
      throw new BadRequestException('Unsupported platform');
    }
    const adapter = PlatformAdapterFactory.create(
      dto.platform,
      this.oauthAdapterConfig(dto.appKey, dto.appSecret),
    );
    if (!adapter) {
      throw new BadRequestException(
        `${dto.platform} does not support OAuth binding`,
      );
    }

    const payload: OauthStatePayload = {
      userId,
      teamId: dto.teamId,
      platform: dto.platform,
      appKey: dto.appKey,
      appSecret: dto.appSecret,
      accountName: dto.accountName,
      accountId: dto.accountId,
    };
    const state = this.crypto.sealOAuthState(payload);
    const authUrl = adapter.getAuthUrl(state);
    return { authUrl, state };
  }

  /**
   * Step 2 — exchange an authorization code for tokens and bind the account.
   * Returns the freshly-bound account plus the verified userId from the sealed
   * state. The callback is stateless (no JWT), so the controller relies on this
   * trusted id to write the audit log.
   */
  async callbackOAuth(
    platform: string,
    code: string,
    state: string,
  ): Promise<{ account: PublicAccount; userId: string }> {
    let payload: OauthStatePayload;
    try {
      payload = this.crypto.openOAuthState(state);
    } catch {
      throw new BadRequestException('Invalid or expired OAuth state');
    }
    if (payload.platform !== platform) {
      throw new BadRequestException('OAuth state does not match platform');
    }

    const adapter = PlatformAdapterFactory.create(
      platform,
      this.oauthAdapterConfig(payload.appKey, payload.appSecret),
    );
    if (!adapter) {
      throw new BadRequestException(`${platform} does not support OAuth binding`);
    }

    let credentials: {
      accessToken?: string;
      refreshToken?: string;
      expiresAt?: Date | string;
    };
    try {
      credentials = await adapter.handleCallback(code);
    } catch (err) {
      this.logger.warn(`OAuth code exchange failed for ${platform}: ${err.message}`);
      throw new BadRequestException(
        `OAuth code exchange failed: ${err.message}`,
      );
    }

    // Persist app credentials alongside the obtained tokens so publish() can
    // rebuild the adapter and re-inject the tokens without a fresh handshake.
    const stored = {
      ...this.oauthAdapterConfig(payload.appKey, payload.appSecret),
      oauth: true,
      accessToken: credentials.accessToken ?? null,
      refreshToken: credentials.refreshToken ?? null,
      expiresAt: credentials.expiresAt instanceof Date
        ? credentials.expiresAt.toISOString()
        : (credentials.expiresAt ?? null),
    };

    const accountId = payload.accountId?.trim()
      || (credentials.accessToken
        ? `${platform.toLowerCase()}_${credentials.accessToken.slice(-12)}`
        : `${platform.toLowerCase()}_oauth`);
    const accountName =
      payload.accountName?.trim() || `${platform}`;

    // Idempotent: re-authorizing an already-bound account refreshes tokens.
    const existing = await this.prisma.socialAccount.findUnique({
      where: { platform_accountId: { platform: platform as Platform, accountId } },
    });
    if (existing) {
      const account = await this.prisma.socialAccount.update({
        where: { id: existing.id },
        data: {
          credentials: this.crypto.encrypt(stored) as unknown as Prisma.InputJsonValue,
          accountName,
          status: AccountStatus.ACTIVE,
        },
        select: PUBLIC_SELECT,
      });
      return { account, userId: payload.userId };
    }

    const account = await this.prisma.socialAccount.create({
      data: {
        teamId: payload.teamId,
        platform: platform as Platform,
        accountId,
        accountName,
        credentials: this.crypto.encrypt(stored) as unknown as Prisma.InputJsonValue,
        status: AccountStatus.ACTIVE,
      },
      select: PUBLIC_SELECT,
    });
    return { account, userId: payload.userId };
  }
}
