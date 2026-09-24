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
    // Weibo's OAuth token endpoint requires application/x-www-form-urlencoded
    // (a JSON body is rejected).
    const data = await this.call<{ access_token: string; expires_in?: number; uid: string }>(
      'https://api.weibo.com/oauth2/access_token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: this.config.appKey,
          client_secret: this.config.appSecret,
          code,
          grant_type: 'authorization_code',
          redirect_uri: this.callbackFor(),
        }).toString(),
      },
    );
    this.accessToken = data.access_token;
    // Weibo issues long-lived access tokens and has no refresh_token grant; an
    // absent/zero expires_in means "does not expire" for normal authorizations.
    this.tokenExpire = data.expires_in
      ? Date.now() + data.expires_in * 1000
      : Number.MAX_SAFE_INTEGER;
    this.refreshTokenValue = null;
    this.uid = data.uid;
    return {
      accessToken: data.access_token,
      refreshToken: undefined,
      expiresAt: new Date(this.tokenExpire),
    };
  }

  async refreshToken(): Promise<Credentials> {
    // Weibo's OAuth2 has no refresh_token grant — access tokens are long-lived
    // and only re-authorization yields a new one. Throw a clear error instead
    // of firing a request the platform does not support.
    throw new Error(
      'Weibo does not support the refresh_token grant; re-authorize the account',
    );
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
