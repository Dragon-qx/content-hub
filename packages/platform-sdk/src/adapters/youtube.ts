import { BaseAdapter } from '../adapter-base';
import {
  Comment,
  Credentials,
  DateRange,
  MetricsResult,
  Platform,
  PublishRequest,
  PublishResult,
} from '../types';

export interface YouTubeConfig {
  /** OAuth2 client id of the Google Cloud project. */
  clientId: string;
  /** OAuth2 client secret of the Google Cloud project. */
  clientSecret: string;
  /** YouTube channel id the account publishes as. */
  channelId?: string;
}

/**
 * YouTube adapter — OAuth2 Authorization Code flow + YouTube Data API v3.
 * See: https://developers.google.com/youtube/v3/docs
 *
 * Capabilities: auth, publish (the metadata create — the binary upload is a
 * separate resumable-upload step the platform requires), channel metrics, and
 * comment threads (fetch + reply). YouTube has no inbox-style DM surface, so
 * fetchMessages falls back to the BaseAdapter "not supported" error.
 */
export class YouTubeAdapter extends BaseAdapter {
  platform = Platform.YOUTUBE;
  private accessToken: string | null = null;
  private tokenExpire = 0;
  private refreshTokenValue: string | null = null;
  private channelId: string;

  constructor(private config: YouTubeConfig) {
    super();
    this.channelId = config.channelId ?? '';
  }

  getAuthUrl(state: string): string {
    const redirect = encodeURIComponent(this.callbackFor());
    return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(
      this.config.clientId,
    )}&redirect_uri=${redirect}&response_type=code&scope=${encodeURIComponent(
      'https://www.googleapis.com/auth/youtube https://www.googleapis.com/auth/youtube.force-ssl',
    )}&access_type=offline&prompt=consent&state=${encodeURIComponent(state)}`;
  }

  async handleCallback(code: string): Promise<Credentials> {
    const data = await this.call<{ access_token: string; refresh_token?: string; expires_in: number }>(
      'https://oauth2.googleapis.com/token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          grant_type: 'authorization_code',
          redirect_uri: this.callbackFor(),
        }).toString(),
      },
    );
    this.accessToken = data.access_token;
    this.refreshTokenValue = data.refresh_token ?? null;
    this.tokenExpire = Date.now() + data.expires_in * 1000;
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(this.tokenExpire),
    };
  }

  async refreshToken(): Promise<Credentials> {
    if (!this.refreshTokenValue) throw new Error('No refresh token for YouTube');
    const data = await this.call<{ access_token: string; expires_in: number }>(
      'https://oauth2.googleapis.com/token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          refresh_token: this.refreshTokenValue,
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          grant_type: 'refresh_token',
        }).toString(),
      },
    );
    this.accessToken = data.access_token;
    this.tokenExpire = Date.now() + data.expires_in * 1000;
    return {
      accessToken: data.access_token,
      refreshToken: this.refreshTokenValue,
      expiresAt: new Date(this.tokenExpire),
    };
  }

  private async getToken(): Promise<string> {
    const injected = this.getInjectedAccessToken();
    if (injected) return injected;
    if (this.accessToken && Date.now() < this.tokenExpire - 60000) return this.accessToken;
    if (this.refreshTokenValue) return (await this.refreshToken()).accessToken;
    throw new Error('YouTube adapter is not authenticated');
  }

  /**
   * Register upload metadata. YouTube requires a multipart resumable upload for
   * the video binary first; this call creates the video resource (the scaffold
   * the binary is attached to) so the external id + url exist immediately.
   */
  async publish(post: PublishRequest): Promise<PublishResult> {
    const token = await this.getToken();
    const data = await this.call<{ id: string }>(
      'https://www.googleapis.com/upload/youtube/v3/videos?part=snippet,status&uploadType=resumable',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Upload-Content-Type': 'video/*',
        },
        body: JSON.stringify({
          snippet: { title: post.extra?.title ?? 'Untitled', description: post.content },
          status: { privacyStatus: 'private' },
        }),
      },
    );
    return {
      externalId: data.id,
      externalUrl: `https://youtu.be/${data.id}`,
      publishedAt: new Date(),
    };
  }

  async fetchMetrics(accountId: string, dateRange: DateRange): Promise<MetricsResult> {
    const token = await this.getToken();
    const id = this.channelId || accountId;
    const data = await this.call<{
      items?: Array<{ statistics: Record<string, string | number> }>;
    }>(`https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const stats = data.items?.[0]?.statistics ?? {};
    const n = (v: string | number | undefined): number =>
      typeof v === 'number' ? v : typeof v === 'string' && v ? parseInt(v, 10) || 0 : 0;
    return {
      impressions: 0,
      engagements: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      views: n(stats.viewCount),
      followerCount: n(stats.subscriberCount),
    };
  }

  async fetchComments(accountId: string, postId: string): Promise<Comment[]> {
    const token = await this.getToken();
    const data = await this.call<{
      items?: Array<{
        id: string;
        snippet: {
          authorChannelId?: { value: string };
          authorDisplayName: string;
          textDisplay: string;
          publishedAt: string;
        };
      }>;
    }>(
      `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${encodeURIComponent(
        postId,
      )}&maxResults=50&textFormat=plainText`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    return (data.items ?? []).map((t) => ({
      id: t.id,
      authorId: t.snippet.authorChannelId?.value ?? '',
      authorName: t.snippet.authorDisplayName,
      content: t.snippet.textDisplay,
      createdAt: new Date(t.snippet.publishedAt),
    }));
  }

  async replyToComment(accountId: string, commentId: string, content: string): Promise<void> {
    const token = await this.getToken();
    await this.call('https://www.googleapis.com/youtube/v3/comments?part=snippet', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        snippet: {
          parentId: commentId,
          textOriginal: content,
        },
      }),
    });
  }
}
