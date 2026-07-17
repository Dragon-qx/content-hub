import { BaseAdapter } from '../adapter-base';
import {
  Credentials,
  DateRange,
  MetricsResult,
  Platform,
  PublishRequest,
  PublishResult,
} from '../types';

export interface DouyinConfig {
  clientKey: string;
  clientSecret: string;
  openId: string;
}

/**
 * 抖音开放平台 (Douyin) adapter.
 * See: https://open.douyin.com/platform/doc?doc=docs/open-interface Logistics/user-authorization
 */
export class DouyinAdapter extends BaseAdapter {
  platform = Platform.DOUYIN;
  private accessToken: string | null = null;
  private tokenExpire = 0;
  private refreshTokenValue: string | null = null;

  constructor(private config: DouyinConfig) {
    super();
  }

  getAuthUrl(state: string): string {
    const redirect = encodeURIComponent('https://your-domain.com/callback/douyin');
    return `https://open.douyin.com/platform/oauth/connect?client_key=${encodeURIComponent(this.config.clientKey)}&response_type=code&scope=user_info,video.list,video.create&redirect_uri=${redirect}&state=${encodeURIComponent(state)}`;
  }

  async handleCallback(code: string): Promise<Credentials> {
    const data = await this.call<{ data: { access_token: string; refresh_token: string; expires_in: number; open_id: string } }>(
      'https://open.douyin.com/oauth/access_token/',
      { method: 'POST', body: JSON.stringify({ client_key: this.config.clientKey, client_secret: this.config.clientSecret, code, grant_type: 'authorization_code' }) },
    );
    const inner = data.data;
    this.accessToken = inner.access_token;
    this.refreshTokenValue = inner.refresh_token;
    this.tokenExpire = Date.now() + inner.expires_in * 1000;
    return { accessToken: inner.access_token, refreshToken: inner.refresh_token, expiresAt: new Date(this.tokenExpire) };
  }

  async refreshToken(): Promise<Credentials> {
    if (!this.refreshTokenValue) throw new Error('No refresh token for Douyin');
    const data = await this.call<{ data: { access_token: string; refresh_token: string; expires_in: number } }>(
      'https://open.douyin.com/oauth/refresh_token/',
      { method: 'POST', body: JSON.stringify({ client_key: this.config.clientKey, refresh_token: this.refreshTokenValue }) },
    );
    this.accessToken = data.data.access_token;
    this.tokenExpire = Date.now() + data.data.expires_in * 1000;
    return { accessToken: data.data.access_token, refreshToken: this.refreshTokenValue, expiresAt: new Date(this.tokenExpire) };
  }

  private async getToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpire - 60000) return this.accessToken;
    if (this.refreshTokenValue) return (await this.refreshToken()).accessToken;
    throw new Error('Douyin adapter is not authenticated');
  }

  async publish(post: PublishRequest): Promise<PublishResult> {
    const token = await this.getToken();
    const data = await this.call<{ data: { item_id: string; share_url: string } }>(
      `https://open.douyin.com/api/apps/v1/video/create/?open_id=${encodeURIComponent(this.config.openId)}&access_token=${encodeURIComponent(token)}`,
      { method: 'POST', body: JSON.stringify({ text: post.content, video_id: '' }) },
    );
    return { externalId: data.data.item_id, externalUrl: data.data.share_url, publishedAt: new Date() };
  }

  async fetchMetrics(accountId: string, dateRange: DateRange): Promise<MetricsResult> {
    const token = await this.getToken();
    const data = await this.call<{ data: { statistics: Record<string, number> } }>(
      `https://open.douyin.com/api/apps/v1/data/extern/fans/?open_id=${encodeURIComponent(this.config.openId)}&access_token=${encodeURIComponent(token)}`,
    );
    const s = data.data.statistics;
    return {
      impressions: s.total_play ?? 0,
      engagements: (s.total_like ?? 0) + (s.total_comment ?? 0) + (s.total_share ?? 0),
      likes: s.total_like ?? 0,
      comments: s.total_comment ?? 0,
      shares: s.total_share ?? 0,
      views: s.total_play ?? 0,
      followerCount: s.total_fans ?? 0,
    };
  }
}
