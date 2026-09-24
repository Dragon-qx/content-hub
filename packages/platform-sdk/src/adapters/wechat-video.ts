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
 *
 * Status (verified 2026-08-29 against 微信开放社区 official answer): 微信官方
 * **尚未开放视频内容发布的开放 API** —— 开放平台只提供商品/橱窗/直播数据等电商能力。
 * Consequently this adapter keeps the OAuth surface (for when an official content
 * API lands) but makes every content operation throw a clear "not supported"
 * error instead of firing requests at the wrong endpoint family (the previous
 * implementation called the WeChat Store `channels/ec/*` endpoints, which a
 * website-login token cannot authorize).
 *
 * See: https://developers.weixin.qq.com/community/develop/doc/00088cbe6942e0e72853b01af66c00
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

  async publish(_post: PublishRequest): Promise<PublishResult> {
    // 微信官方暂未开放视频内容发布的开放 API —— 明确失败而不是调用错误端点。
    throw new Error(
      'WeChat Channels (视频号) does not yet expose an open API for publishing video content. ' +
        'Publish manually via 视频号助手 or wait for the official API to open.',
    );
  }

  async fetchMetrics(_accountId: string, _dateRange: DateRange): Promise<MetricsResult> {
    // No official content-metrics API for 视频号 exists yet.
    throw new Error(
      'WeChat Channels (视频号) does not yet expose an open API for content metrics.',
    );
  }

  async fetchComments(_accountId: string, _postId: string): Promise<Comment[]> {
    // No official comment API for 视频号 content exists yet.
    throw new Error(
      'WeChat Channels (视频号) does not yet expose an open API for comments.',
    );
  }
}
