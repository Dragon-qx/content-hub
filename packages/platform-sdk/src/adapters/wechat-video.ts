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

export interface WechatVideoConfig {
  clientKey: string;
  clientSecret: string;
  accountId: string;
}

/**
 * 微信视频号 (WeChat Channels) adapter.
 * Uses the official 视频号开放平台 OAuth2 + content APIs.
 * See: https://developers.weixin.qq.com/doc/channels/API/basics/getaccesstoken.html
 */
export class WechatVideoAdapter extends BaseAdapter {
  platform = Platform.WECHAT_VIDEO;
  private accessToken: string | null = null;
  private tokenExpire = 0;
  private refreshTokenValue: string | null = null;

  constructor(private config: WechatVideoConfig) {
    super();
  }

  getAuthUrl(state: string): string {
    const redirect = encodeURIComponent(this.callbackFor());
    return `https://open.weixin.qq.com/connect/qrconnect?appid=${encodeURIComponent(this.config.clientKey)}&redirect_uri=${redirect}&response_type=code&scope=snsapi_login&state=${encodeURIComponent(state)}#wechat_redirect`;
  }

  async handleCallback(code: string): Promise<Credentials> {
    const data = await this.call<{ access_token: string; refresh_token: string; expires_in: number }>(
      `https://api.weixin.qq.com/sns/oauth2/access_token?appid=${encodeURIComponent(this.config.clientKey)}&secret=${encodeURIComponent(this.config.clientSecret)}&code=${encodeURIComponent(code)}&grant_type=authorization_code`,
    );
    this.accessToken = data.access_token;
    this.refreshTokenValue = data.refresh_token;
    this.tokenExpire = Date.now() + data.expires_in * 1000;
    return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt: new Date(this.tokenExpire) };
  }

  async refreshToken(): Promise<Credentials> {
    if (!this.refreshTokenValue) throw new Error('No refresh token available for WeChat Video');
    const data = await this.call<{ access_token: string; refresh_token: string; expires_in: number }>(
      `https://api.weixin.qq.com/sns/oauth2/refresh_token?appid=${encodeURIComponent(this.config.clientKey)}&grant_type=refresh_token&refresh_token=${encodeURIComponent(this.refreshTokenValue)}`,
    );
    this.accessToken = data.access_token;
    this.refreshTokenValue = data.refresh_token;
    this.tokenExpire = Date.now() + data.expires_in * 1000;
    return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt: new Date(this.tokenExpire) };
  }

  private async getToken(): Promise<string> {
    const injected = this.getInjectedAccessToken();
    if (injected) return injected;
    if (this.accessToken && Date.now() < this.tokenExpire - 60000) return this.accessToken;
    if (this.refreshTokenValue) return (await this.refreshToken()).accessToken;
    throw new Error('WeChat Video adapter is not authenticated');
  }

  /**
   * Upload a video to WeChat Channels and return the media_id.
   * Real API: POST /channels/ec/basics/video/upload with multipart form.
   */
  async uploadVideo(mediaUrl: string): Promise<string> {
    const token = await this.getToken();
    const bytes = await this.fetchMediaBytes(mediaUrl);
    const form = new FormData();
    form.append('media', new Blob([bytes], { type: 'video/mp4' }), 'video.mp4');
    const data = await this.callMultipart<{ media_id: string }>(
      `https://api.weixin.qq.com/channels/ec/basics/video/upload?access_token=${encodeURIComponent(token)}`,
      form,
    );
    return data.media_id;
  }

  async publish(post: PublishRequest): Promise<PublishResult> {
    const token = await this.getToken();
    // Upload video first if mediaUrls provided
    let mediaId = '';
    if (post.mediaUrls?.length) {
      mediaId = await this.uploadVideo(post.mediaUrls[0]);
    }
    const data = await this.call<{ publish_id: string }>(
      `https://api.weixin.qq.com/channels/ec/publish/submit?access_token=${encodeURIComponent(token)}`,
      { method: 'POST', body: JSON.stringify({ title: post.content, media_id: mediaId }) },
    );
    return {
      externalId: data.publish_id,
      externalUrl: `https://channels.weixin.qq.com/#/publish/${data.publish_id}`,
      publishedAt: new Date(),
    };
  }

  async fetchMetrics(accountId: string, dateRange: DateRange): Promise<MetricsResult> {
    const token = await this.getToken();
    const data = await this.call<Record<string, number>>(
      `https://api.weixin.qq.com/channels/ec/basics/getaccessinfo?access_token=${encodeURIComponent(token)}`,
    );
    return {
      impressions: data.play_cnt ?? 0,
      engagements: data.like_cnt ?? 0,
      likes: data.like_cnt ?? 0,
      comments: data.comment_cnt ?? 0,
      shares: data.share_cnt ?? 0,
      views: data.play_cnt ?? 0,
      followerCount: data.fans_cnt ?? 0,
    };
  }

  async fetchComments(accountId: string, postId: string): Promise<Comment[]> {
    const token = await this.getToken();
    const data = await this.call<{ comments: Array<{ comment_id: string; nickname: string; content: string; create_time: number }> }>(
      `https://api.weixin.qq.com/channels/ec/comment/list?access_token=${encodeURIComponent(token)}&item_id=${encodeURIComponent(postId)}`,
    );
    return (data.comments ?? []).map((c) => ({
      id: c.comment_id,
      authorId: c.nickname,
      authorName: c.nickname,
      content: c.content,
      createdAt: new Date(c.create_time * 1000),
    }));
  }
}
