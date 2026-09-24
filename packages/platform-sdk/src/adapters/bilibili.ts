import { createHash, createHmac, randomBytes } from 'crypto';
import { BaseAdapter } from '../adapter-base';
import {
  Comment,
  Credentials,
  DateRange,
  Message,
  MetricsResult,
  Platform,
  PublishRequest,
  PublishResult,
} from '../types';

export interface BilibiliConfig {
  accessKey: string;
  secretKey: string;
  accountId: string;
}

/**
 * B站 (Bilibili) 开放平台 adapter — official arcopen API family.
 * Verified 2026-08-29 against open.bilibili.com docs + bilibili-openplatform/demo:
 *   - OAuth token: POST https://api.bilibili.com/x/account-oauth2/v1/token
 *     (client_id/client_secret; the official demo uses exactly this endpoint)
 *   - 签名 2.0: HMAC-SHA256(app_secret, sorted "x-bili-*" headers joined as
 *     "key:value\n"), 结果放 Authorization 头
 *   - 业务网关: https://member.bilibili.com/arcopen/fn/...，响应包裹 { code, data, message }
 *
 * 视频二进制上传管道（arcopen/fn/archive/video/init → openupos 分片上传 → complete →
 * cover → add-by-utoken）中 openupos 的 X-Upos-Auth 认证未经官方文档联调确认，
 * 故 publish() 明确报错，而不是调用内部 web 端点（原实现用了需 cookie/WBI 的
 * member.bilibili.com/x/web/archive/post/add）。fetchComments 走公开只读端点保持可用；
 * 需要登录态 cookie 的 web_im 私信与评论回复同样明确报错。
 */
export class BilibiliAdapter extends BaseAdapter {
  platform = Platform.BILIBILI;
  private accessToken: string | null = null;
  private tokenExpire = 0;
  private refreshTokenValue: string | null = null;

  constructor(private config: BilibiliConfig) {
    super();
  }

  getAuthUrl(state: string): string {
    const redirect = encodeURIComponent(this.callbackFor());
    return `https://passport.bilibili.com/register/pc_oauth2.html#/?client_id=${encodeURIComponent(this.config.accessKey)}&return_url=${redirect}&state=${encodeURIComponent(state)}`;
  }

  async handleCallback(code: string): Promise<Credentials> {
    const data = await this.call<{ access_token: string; refresh_token: string; expires_in: number }>(
      'https://api.bilibili.com/x/account-oauth2/v1/token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: this.config.accessKey,
          client_secret: this.config.secretKey,
          code,
          grant_type: 'authorization_code',
        }).toString(),
      },
    );
    this.accessToken = data.access_token;
    this.refreshTokenValue = data.refresh_token;
    this.tokenExpire = Date.now() + data.expires_in * 1000;
    return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt: new Date(this.tokenExpire) };
  }

  async refreshToken(): Promise<Credentials> {
    if (!this.refreshTokenValue) throw new Error('No refresh token for Bilibili');
    const data = await this.call<{ access_token: string; refresh_token: string; expires_in: number }>(
      'https://api.bilibili.com/x/account-oauth2/v1/token/refresh',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: this.config.accessKey,
          client_secret: this.config.secretKey,
          refresh_token: this.refreshTokenValue,
          grant_type: 'refresh_token',
        }).toString(),
      },
    );
    this.accessToken = data.access_token;
    if (data.refresh_token) this.refreshTokenValue = data.refresh_token;
    this.tokenExpire = Date.now() + data.expires_in * 1000;
    return { accessToken: data.access_token, refreshToken: this.refreshTokenValue, expiresAt: new Date(this.tokenExpire) };
  }

  private async getToken(): Promise<string> {
    const injected = this.getInjectedAccessToken();
    if (injected) return injected;
    if (this.accessToken && Date.now() < this.tokenExpire - 60000) return this.accessToken;
    if (this.refreshTokenValue) return (await this.refreshToken()).accessToken;
    throw new Error('Bilibili adapter is not authenticated');
  }

  /**
   * Official 签名 2.0 request headers for an arcopen call:
   * HMAC-SHA256(app_secret, sorted "x-bili-*" headers joined as "key:value\n").
   */
  private signArcOpen(token: string, body: string): Record<string, string> {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = randomBytes(16).toString('hex');
    const headers: Record<string, string> = {
      'x-bili-accesskeyid': this.config.accessKey,
      'x-bili-content-md5': createHash('md5').update(body).digest('hex'),
      'x-bili-signature-method': 'HMAC-SHA256',
      'x-bili-signature-nonce': nonce,
      'x-bili-signature-version': '2.0',
      'x-bili-timestamp': timestamp,
    };
    const signString = Object.keys(headers)
      .sort()
      .map((k) => `${k}:${headers[k]}\n`)
      .join('');
    const authorization = createHmac('sha256', this.config.secretKey)
      .update(signString)
      .digest('hex');
    return {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'Access-Token': token,
      ...headers,
      Authorization: authorization,
    };
  }

  /** POST to the arcopen gateway with official 签名 2.0, unwrap {code, data}. */
  private async callArcOpen<T>(path: string, token: string, body: unknown): Promise<T> {
    const bodyStr = JSON.stringify(body);
    const res = await this.call<{ code: number; data?: T; message?: string; request_id?: string }>(
      `https://member.bilibili.com/arcopen/fn${path}`,
      { method: 'POST', headers: this.signArcOpen(token, bodyStr), body: bodyStr },
    );
    if (res.code !== 0) {
      throw new Error(
        `Bilibili ${path} failed (code=${res.code}): ${res.message ?? 'unknown error'}`,
      );
    }
    return res.data as T;
  }

  async publish(_post: PublishRequest): Promise<PublishResult> {
    // 视频二进制上传管道中 openupos 的 X-Upos-Auth 认证未经官方文档确认；
    // 签名 2.0 + arcopen 网关已就绪，但发布管道暂不接线，避免发到错误端点。
    throw new Error(
      'Bilibili video upload pipeline (arcopen video/init → chunked upload → complete → cover → add-by-utoken) ' +
        'is not yet wired against the official open API; signature 2.0 plumbing is in place.',
    );
  }

  async fetchMetrics(_accountId: string, _dateRange: DateRange): Promise<MetricsResult> {
    throw new Error(
      'Bilibili content metrics are not available via the open platform without the data-open scope; not wired.',
    );
  }

  /** 公开只读评论端点（无需登录），保持可用。 */
  async fetchComments(accountId: string, postId: string): Promise<Comment[]> {
    const data = await this.call<{ data: { replies: Array<{ rpid: number; member: { uname: string }; content: { message: string }; ctime: number }> } }>(
      `https://api.bilibili.com/x/v2/reply?type=1&oid=${encodeURIComponent(postId)}&sort=0`,
    );
    return (data.data?.replies ?? []).map((r) => ({
      id: String(r.rpid),
      authorId: r.member.uname,
      authorName: r.member.uname,
      content: r.content.message,
      createdAt: new Date(r.ctime * 1000),
    }));
  }

  async replyToComment(_accountId: string, _commentId: string, _content: string): Promise<void> {
    throw new Error(
      'Bilibili comment replies require a web-session cookie (bili_jct/SESSDATA), not an open-platform token — not wired.',
    );
  }

  async fetchMessages(_accountId: string): Promise<Message[]> {
    throw new Error(
      'Bilibili private messages require a web-session cookie, not an open-platform token — not wired.',
    );
  }

  async replyToMessage(_accountId: string, _messageId: string, _content: string): Promise<void> {
    throw new Error(
      'Bilibili private-message replies require a web-session cookie, not an open-platform token — not wired.',
    );
  }
}
