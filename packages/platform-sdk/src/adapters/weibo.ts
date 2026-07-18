import { BaseAdapter } from '../adapter-base';
import {
  Credentials,
  DateRange,
  MetricsResult,
  Platform,
  PublishRequest,
  PublishResult,
} from '../types';

export interface WeiboConfig {
  appKey: string;
  appSecret: string;
  uid: string;
}

/**
 * 新浪微博开放平台 (Weibo) adapter.
 * See: https://open.weibo.com/wiki/%E5%BE%AE%E5%8D%9AAPI
 */
export class WeiboAdapter extends BaseAdapter {
  platform = Platform.WEIBO;
  private accessToken: string | null = null;
  private tokenExpire = 0;
  private refreshTokenValue: string | null = null;
  private uid: string;

  constructor(private config: WeiboConfig) {
    super();
    this.uid = config.uid;
  }

  getAuthUrl(state: string): string {
    const redirect = encodeURIComponent(this.callbackFor());
    return `https://api.weibo.com/oauth2/authorize?client_id=${encodeURIComponent(this.config.appKey)}&response_type=code&redirect_uri=${redirect}&state=${encodeURIComponent(state)}`;
  }

  async handleCallback(code: string): Promise<Credentials> {
    const data = await this.call<{ access_token: string; refresh_token: string; expires_in: number; uid: string }>(
      'https://api.weibo.com/oauth2/access_token',
      {
        method: 'POST',
        body: JSON.stringify({
          client_id: this.config.appKey,
          client_secret: this.config.appSecret,
          code,
          grant_type: 'authorization_code',
          redirect_uri: this.callbackFor(),
        }),
      },
    );
    this.accessToken = data.access_token;
    this.refreshTokenValue = data.refresh_token;
    this.tokenExpire = Date.now() + data.expires_in * 1000;
    this.uid = data.uid;
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(this.tokenExpire),
    };
  }

  async refreshToken(): Promise<Credentials> {
    if (!this.refreshTokenValue) throw new Error('No refresh token for Weibo');
    const data = await this.call<{ access_token: string; refresh_token: string; expires_in: number }>(
      'https://api.weibo.com/oauth2/access_token',
      {
        method: 'POST',
        body: JSON.stringify({
          client_id: this.config.appKey,
          refresh_token: this.refreshTokenValue,
          grant_type: 'refresh_token',
        }),
      },
    );
    this.accessToken = data.access_token;
    this.refreshTokenValue = data.refresh_token;
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
    throw new Error('Weibo adapter is not authenticated');
  }

  async publish(post: PublishRequest): Promise<PublishResult> {
    const token = await this.getToken();
    const data = await this.call<{ id: string; idstr: string; url?: string }>(
      'https://api.weibo.com/2/statuses/share.json',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: `${post.content} ${post.extra?.url ?? ''}`.trim() }),
      },
    );
    return {
      externalId: data.idstr,
      externalUrl: data.url ?? `https://weibo.com/${this.uid}/${data.idstr}`,
      publishedAt: new Date(),
    };
  }

  async fetchMetrics(accountId: string, dateRange: DateRange): Promise<MetricsResult> {
    const token = await this.getToken();
    const data = await this.call<{ followers_count: number; friends_count: number; statuses_count: number }>(
      `https://api.weibo.com/2/users/show.json?access_token=${encodeURIComponent(token)}&uid=${encodeURIComponent(this.uid)}`,
    );
    return {
      impressions: 0,
      engagements: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      views: 0,
      followerCount: data.followers_count ?? 0,
    };
  }
}
