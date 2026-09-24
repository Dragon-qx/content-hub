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
   * Publish a video via the YouTube resumable-upload protocol:
   *   1. POST metadata to the resumable endpoint → the session URL comes back
   *      in the `Location` header (body is EMPTY — parsing it used to throw).
   *   2. PUT the video bytes to that session URL → 201 with the created
   *      `{ id, ... }` resource.
   * The video binary is fetched from `post.mediaUrls[0]`.
   */
  async publish(post: PublishRequest): Promise<PublishResult> {
    const token = await this.getToken();
    const mediaUrl = post.mediaUrls?.[0];
    if (!mediaUrl) {
      throw new Error(
        'YouTube publish requires a video media URL (post.mediaUrls[0])',
      );
    }
    const videoBytes = await this.fetchMediaBytes(mediaUrl);

    const uploadUrl = await this.initResumableUpload(token, {
      snippet: { title: post.extra?.title ?? 'Untitled', description: post.content },
      status: { privacyStatus: 'private' },
    }, videoBytes.byteLength);

    const data = await this.uploadVideoBytes(uploadUrl, token, videoBytes);
    return {
      externalId: data.id,
      externalUrl: `https://youtu.be/${data.id}`,
      publishedAt: new Date(),
    };
  }

  /** Step 1 — open a resumable session; returns the upload URL from Location. */
  private async initResumableUpload(
    token: string,
    metadata: unknown,
    byteLength: number,
  ): Promise<string> {
    const res = await this.rawFetch(
      'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Type': 'video/*',
          'X-Upload-Content-Length': String(byteLength),
        },
        body: JSON.stringify(metadata),
      },
    );
    if (!res.ok) {
      throw new Error(`YouTube upload init failed: HTTP ${res.status}`);
    }
    const location = res.headers.get('location');
    if (!location) {
      throw new Error('YouTube upload init returned no Location header');
    }
    return location;
  }

  /** Step 2 — PUT the video bytes to the session URL and parse the video id. */
  private async uploadVideoBytes(
    uploadUrl: string,
    token: string,
    bytes: ArrayBuffer,
  ): Promise<{ id: string }> {
    const res = await this.rawFetch(uploadUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'video/*',
        'Content-Length': String(bytes.byteLength),
      },
      body: bytes,
    });
    if (!res.ok) {
      // 308 means the session exists but the transfer is incomplete — treat any
      // non-success as a failed upload rather than parsing a partial body.
      throw new Error(`YouTube video upload failed: HTTP ${res.status}`);
    }
    const text = await res.text();
    return JSON.parse(text) as { id: string };
  }

  /** Raw fetch with SSRF validation + timeout, for flows that need response
   *  headers (the resumable upload Location) which `call()` does not expose. */
  private async rawFetch(url: string, init: RequestInit): Promise<Response> {
    await this.validateUrl(url);
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      BaseAdapter.REQUEST_TIMEOUT_MS,
    );
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
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
