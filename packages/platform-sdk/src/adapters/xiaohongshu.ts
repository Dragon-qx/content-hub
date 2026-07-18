import { createHmac } from 'crypto';
import { BaseAdapter } from '../adapter-base';
import {
  Credentials,
  DateRange,
  MetricsResult,
  Platform,
  PublishRequest,
  PublishResult,
} from '../types';

export interface XiaoHongShuConfig {
  appKey: string;
  appSecret: string;
  accountId: string;
}

/**
 * 小红书专业号 (XiaoHongShu / Red) open-platform adapter.
 * Note: the real API uses request signing (signature = HMAC-SHA256 of the
 * canonical request); we mirror that shape here so a real integration only
 * needs real credentials and hostnames.
 * See: https://open.xiaohongshu.com/document/doc?docId=64f1b21a00000000
 */
export class XiaoHongShuAdapter extends BaseAdapter {
  platform = Platform.XIAOHONGSHU;
  private accessToken: string | null = null;
  private tokenExpire = 0;
  private refreshTokenValue: string | null = null;

  constructor(private config: XiaoHongShuConfig) {
    super();
  }

  /** Sign a request body per the Red open-platform spec. */
  private sign(body: string): string {
    return createHmac('sha256', this.config.appSecret).update(body).digest('hex');
  }

  getAuthUrl(state: string): string {
    const redirect = encodeURIComponent(this.callbackFor());
    return `https://customer.xiaohongshu.com/api/oauth/v1/authorize?app_key=${encodeURIComponent(this.config.appKey)}&redirect_uri=${redirect}&response_type=code&state=${encodeURIComponent(state)}`;
  }

  async handleCallback(code: string): Promise<Credentials> {
    const payload = JSON.stringify({ app_key: this.config.appKey, app_secret: this.config.appSecret, code, grant_type: 'authorization_code' });
    const data = await this.call<{ access_token: string; refresh_token?: string; expires_in: number }>(
      'https://customer.xiaohongshu.com/api/oauth/v1/token',
      { method: 'POST', headers: { 'X-Signature': this.sign(payload) }, body: payload },
    );
    this.accessToken = data.access_token;
    // The token endpoint returns a refresh token alongside the access token;
    // persist it so refreshToken() can rotate without a fresh handshake.
    if (data.refresh_token) this.refreshTokenValue = data.refresh_token;
    this.tokenExpire = Date.now() + data.expires_in * 1000;
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(this.tokenExpire),
    };
  }

  async refreshToken(): Promise<Credentials> {
    if (!this.refreshTokenValue) throw new Error('No refresh token for XiaoHongShu');
    const payload = JSON.stringify({
      app_key: this.config.appKey,
      app_secret: this.config.appSecret,
      refresh_token: this.refreshTokenValue,
      grant_type: 'refresh_token',
    });
    const data = await this.call<{ access_token: string; refresh_token?: string; expires_in: number }>(
      'https://customer.xiaohongshu.com/api/oauth/v1/token',
      { method: 'POST', headers: { 'X-Signature': this.sign(payload) }, body: payload },
    );
    this.accessToken = data.access_token;
    if (data.refresh_token) this.refreshTokenValue = data.refresh_token;
    this.tokenExpire = Date.now() + data.expires_in * 1000;
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(this.tokenExpire),
    };
  }

  private async getToken(): Promise<string> {
    const injected = this.getInjectedAccessToken();
    if (injected) return injected;
    if (this.accessToken && Date.now() < this.tokenExpire - 60000) return this.accessToken;
    if (this.refreshTokenValue) return (await this.refreshToken()).accessToken;
    throw new Error('XiaoHongShu adapter is not authenticated');
  }

  async publish(post: PublishRequest): Promise<PublishResult> {
    const token = await this.getToken();
    const payload = JSON.stringify({ title: post.content.slice(0, 20), content: post.content, media_urls: post.mediaUrls ?? [] });
    const data = await this.call<{ note_id: string }>(
      `https://customer.xiaohongshu.com/api/notes/v1/publish`,
      { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'X-Signature': this.sign(payload) }, body: payload },
    );
    return { externalId: data.note_id, externalUrl: `https://www.xiaohongshu.com/explore/${data.note_id}`, publishedAt: new Date() };
  }

  async fetchMetrics(accountId: string, dateRange: DateRange): Promise<MetricsResult> {
    const token = await this.getToken();
    const payload = JSON.stringify({ account_id: accountId, start: dateRange.start.toISOString(), end: dateRange.end.toISOString() });
    const data = await this.call<{ data: Record<string, number> }>(
      `https://customer.xiaohongshu.com/api/insights/v1/overview`,
      { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'X-Signature': this.sign(payload) }, body: payload },
    );
    const d = data.data;
    return {
      impressions: d.exposure ?? 0,
      engagements: (d.like ?? 0) + (d.collect ?? 0) + (d.comment ?? 0),
      likes: d.like ?? 0,
      comments: d.comment ?? 0,
      shares: d.share ?? 0,
      views: d.view ?? 0,
      followerCount: d.fans ?? 0,
    };
  }
}
