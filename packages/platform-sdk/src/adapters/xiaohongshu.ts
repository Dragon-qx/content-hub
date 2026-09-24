import { createHash } from 'crypto';
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
 * 小红书专业号 (XiaoHongShu / Red) open-platform adapter — OAuth2 (v3 signing).
 * Official docs (verified 2026-08-29):
 *   - 签名算法: sign = MD5(method + "?appId=" + appId + "&timestamp=" + timestamp
 *     + "&version=" + version + appSecret);  OAuth2 后 version = "2.0"
 *   - 业务网关: POST https://ark.xiaohongshu.com/ark/open_api/v3/common_controller
 *     Content-Type: application/json; body 含 sign/appId/accessToken/timestamp/version/method + 业务参数
 *   - 返回包裹: { "error_code": 0, "data": {...}, "success": true }
 * See: https://xiaohongshu.apifox.cn/doc-2810932 (签名算法) / doc-2810935 (系统参数)
 *
 * Note: 笔记发布的业务字段名（note.publish 的 title/content/media_urls）与素材上传的
 * 方法名以官方文档为准；未经真实凭据联调验证前标记为「按官方签名接入，业务字段待联调确认」。
 */
export class XiaoHongShuAdapter extends BaseAdapter {
  platform = Platform.XIAOHONGSHU;
  private accessToken: string | null = null;
  private tokenExpire = 0;
  private refreshTokenValue: string | null = null;

  /** 业务网关，所有签名请求都发到这里。 */
  private static readonly GATEWAY =
    'https://ark.xiaohongshu.com/ark/open_api/v3/common_controller';
  /** OAuth2 授权后的接口版本。 */
  private static readonly API_VERSION = '2.0';

  constructor(private config: XiaoHongShuConfig) {
    super();
  }

  /** 官方 v3 签名：MD5(method?appId=..&timestamp=..&version=.. + appSecret)。 */
  private sign(method: string, timestamp: number, version: string): string {
    const base = `${method}?appId=${this.config.appKey}&timestamp=${timestamp}&version=${version}`;
    return createHash('md5').update(`${base}${this.config.appSecret}`).digest('hex');
  }

  /**
   * POST a business request to the common gateway and unwrap the official
   * `{ error_code, data, success }` envelope, throwing on any error_code != 0.
   */
  private async callApi<T>(
    method: string,
    token: string,
    params: Record<string, unknown>,
  ): Promise<T> {
    const timestamp = Math.floor(Date.now() / 1000);
    const payload = {
      appId: this.config.appKey,
      accessToken: token,
      timestamp,
      version: XiaoHongShuAdapter.API_VERSION,
      method,
      sign: this.sign(method, timestamp, XiaoHongShuAdapter.API_VERSION),
      ...params,
    };
    const res = await this.call<{
      error_code: number;
      success?: boolean;
      data?: T;
      error_msg?: string;
      msg?: string;
    }>(XiaoHongShuAdapter.GATEWAY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.error_code !== 0) {
      throw new Error(
        `XiaoHongShu ${method} failed (error_code=${res.error_code}): ${
          res.error_msg ?? res.msg ?? 'unknown error'
        }`,
      );
    }
    return res.data as T;
  }

  getAuthUrl(state: string): string {
    const redirect = encodeURIComponent(this.callbackFor());
    return `https://customer.xiaohongshu.com/api/oauth/v1/authorize?app_key=${encodeURIComponent(this.config.appKey)}&redirect_uri=${redirect}&response_type=code&state=${encodeURIComponent(state)}`;
  }

  async handleCallback(code: string): Promise<Credentials> {
    const data = await this.call<{ access_token: string; refresh_token?: string; expires_in: number }>(
      'https://customer.xiaohongshu.com/api/oauth/v1/token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app_key: this.config.appKey,
          app_secret: this.config.appSecret,
          code,
          grant_type: 'authorization_code',
        }),
      },
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

  async refreshToken(): Promise<Credentials> {
    if (!this.refreshTokenValue) throw new Error('No refresh token for XiaoHongShu');
    const data = await this.call<{ access_token: string; refresh_token?: string; expires_in: number }>(
      'https://customer.xiaohongshu.com/api/oauth/v1/token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app_key: this.config.appKey,
          app_secret: this.config.appSecret,
          refresh_token: this.refreshTokenValue,
          grant_type: 'refresh_token',
        }),
      },
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
    // note.publish 业务字段以官方文档为准；media_urls 需先经「上传素材」接口获得。
    const data = await this.callApi<{ note_id: string }>('note.publish', token, {
      title: post.content.slice(0, 20),
      content: post.content,
      media_urls: post.mediaUrls ?? [],
    });
    return {
      externalId: data.note_id,
      externalUrl: `https://www.xiaohongshu.com/explore/${data.note_id}`,
      publishedAt: new Date(),
    };
  }

  async fetchMetrics(_accountId: string, _dateRange: DateRange): Promise<MetricsResult> {
    // 未核实的旧实现指向 customer 域 insights 端点；官方数据接口的方法名待确认，
    // 宁可明确报错也不发到错误端点。
    throw new Error(
      'XiaoHongShu metrics endpoint is not yet wired against the official open API — verify the insights method name before use.',
    );
  }
}
