/**
 * 微信公众号平台适配器
 * 提供 access_token 获取、素材管理、草稿管理、发布等功能。
 *
 * Extends BaseAdapter so it honours the PlatformAdapter contract (publish /
 * fetchMetrics) and can also be seeded with a pre-existing token via
 * setCredentials().
 */

import { BaseAdapter } from '../adapter-base';
import {
  Comment,
  DateRange,
  MetricsResult,
  Platform,
  PublishRequest,
  PublishResult,
} from '../types';

export interface WechatOfficialConfig {
  appid: string;
  secret: string;
  rawId: string;
}

export interface WechatArticles {
  title: string;
  author?: string;
  digest?: string;
  content: string;
  content_source_url?: string;
  thumb_media_id: string;
  need_open_comment?: number;
  only_fans_can_comment?: number;
}

export interface WechatDraftResult {
  media_id: string;
}

export interface WechatPublishResult {
  publish_id: string;
}

export interface WechatMaterialItem {
  media_id: string;
  name: string;
  url: string;
  update_time: number;
}

export interface WechatMaterialResult {
  total_count: number;
  item_count: number;
  item: WechatMaterialItem[];
}

export class WechatOfficialAdapter extends BaseAdapter {
  platform = Platform.WECHAT_OFFICIAL;
  private accessToken: string | null = null;
  private tokenExpireTime = 0;

  constructor(private config: WechatOfficialConfig) {
    super();
  }

  getAuthUrl(state: string): string {
    const redirect = encodeURIComponent(this.callbackFor());
    return `https://open.weixin.qq.com/connect/oauth2/authorize?appid=${encodeURIComponent(this.config.appid)}&redirect_uri=${redirect}&response_type=code&scope=snsapi_base&state=${encodeURIComponent(state)}#wechat_redirect`;
  }

  /** WeChat Official uses the client_credential grant; this derives the token. */
  async handleCallback(): Promise<{
    accessToken: string;
    expiresAt: Date;
  }> {
    const token = await this.getAccessToken();
    return { accessToken: token, expiresAt: new Date(this.tokenExpireTime) };
  }

  /**
   * 获取微信公众号 access_token
   * 会缓存 token，过期前自动刷新。优先使用注入的已存 token。
   */
  async getAccessToken(): Promise<string> {
    const injected = this.getInjectedAccessToken();
    if (injected) {
      this.accessToken = injected;
      return injected;
    }
    if (this.accessToken && Date.now() < this.tokenExpireTime - 60000) {
      return this.accessToken;
    }

    const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(this.config.appid)}&secret=${encodeURIComponent(this.config.secret)}`;

    const resp = await fetch(url);
    if (!resp.ok) {
      throw new Error(`WeChat token request failed: HTTP ${resp.status}`);
    }

    const data = (await resp.json()) as {
      access_token?: string;
      expires_in?: number;
      errcode?: number;
      errmsg?: string;
    };

    if (!data.access_token) {
      throw new Error(`WeChat API error: ${data.errcode} - ${data.errmsg}`);
    }

    this.accessToken = data.access_token;
    // 提前 60 秒过期，避免边界问题
    this.tokenExpireTime = Date.now() + (data.expires_in ?? 7200) * 1000;
    return this.accessToken;
  }

  /** 兼容 BaseAdapter 的 getToken 管道：delegate 到 client-credential 流程。 */
  private async getToken(): Promise<string> {
    return this.getAccessToken();
  }

  /**
   * Publish a post: create a multimedia draft then submit it.
   *
   * WeChat requires a thumb_media_id (permanent image material) for every
   * article draft. If `post.mediaUrls` is supplied the first URL is uploaded
   * via the real `/cgi-bin/material/add_material` multipart endpoint and its
   * returned media_id is used. Without a cover image the call throws because
   * WeChat will reject a draft with a placeholder thumb.
   */
  async publish(post: PublishRequest): Promise<PublishResult> {
    const title = (post.extra as { title?: string } | undefined)?.title ?? 'Untitled';
    const thumbUrl = post.mediaUrls?.[0];
    if (!thumbUrl) {
      throw new Error(
        'WeChat Official requires a cover image (thumb) — pass mediaUrls[0]',
      );
    }
    const thumb = await this.uploadImageMaterial(thumbUrl);
    const draft = await this.createDraft([
      {
        title,
        content: post.content,
        thumb_media_id: thumb.media_id,
      },
    ]);
    const result = await this.publishDraft(draft.media_id);
    return {
      externalId: result.publish_id,
      externalUrl: `https://mp.weixin.qq.com/${result.publish_id}`,
      publishedAt: new Date(),
    };
  }

  async fetchMetrics(): Promise<MetricsResult> {
    // 公众号没有直接返回“曝光/互动”的公开接口；这里返回粉丝数作为主指标。
    const followerCount = await this.getFollowerCount();
    return {
      impressions: 0,
      engagements: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      views: 0,
      followerCount,
    };
  }

  /**
   * 获取粉丝总数
   * 注意：需要已认证的服务号
   */
  async getFollowerCount(): Promise<number> {
    const token = await this.getToken();
    const url = `https://api.weixin.qq.com/cgi-bin/user/get?access_token=${encodeURIComponent(token)}`;

    const resp = await fetch(url);
    if (!resp.ok) {
      throw new Error(`WeChat user/get failed: HTTP ${resp.status}`);
    }

    const data = (await resp.json()) as { total?: number; errcode?: number; errmsg?: string };

    if (data.errcode && data.errcode !== 0) {
      throw new Error(`WeChat API error: ${data.errcode} - ${data.errmsg}`);
    }

    return data.total ?? 0;
  }

  /**
   * 获取素材列表
   * @param type 素材类型：image/video/voice/news
   * @param offset 偏移量
   * @param count 数量
   */
  async getMaterials(type = 'news', offset = 0, count = 20): Promise<WechatMaterialResult> {
    const token = await this.getToken();
    const url = `https://api.weixin.qq.com/cgi-bin/material/batchget_material?access_token=${encodeURIComponent(token)}`;

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, offset, count }),
    });

    if (!resp.ok) {
      throw new Error(`WeChat material failed: HTTP ${resp.status}`);
    }

    const data = (await resp.json()) as WechatMaterialResult & { errcode?: number; errmsg?: string };

    if (data.errcode && data.errcode !== 0) {
      throw new Error(`WeChat API error: ${data.errcode} - ${data.errmsg}`);
    }

    return data;
  }

  /**
   * Upload a permanent image material via the real WeChat multipart endpoint.
   *
   * The WeChat API requires multipart/form-data with the raw image bytes (not
   * a JSON body). This method fetches the image from `imageUrl` and POSTs it
   * to `/cgi-bin/material/add_material?type=image`.
   */
  async uploadImageMaterial(imageUrl: string): Promise<{ media_id: string; url: string }> {
    const token = await this.getToken();
    const bytes = await this.fetchMediaBytes(imageUrl);
    const form = new FormData();
    form.append('media', new Blob([bytes], { type: 'image/jpeg' }), 'cover.jpg');
    const data = await this.callMultipart<{ media_id: string; url: string }>(
      `https://api.weixin.qq.com/cgi-bin/material/add_material?access_token=${encodeURIComponent(token)}&type=image`,
      form,
    );
    if (!data.media_id) {
      throw new Error('WeChat add material returned no media_id');
    }
    return { media_id: data.media_id, url: data.url };
  }

  /**
   * @deprecated Use {@link uploadImageMaterial} which uses the real multipart endpoint.
   */
  async addImageMaterial(imageUrl: string): Promise<{ media_id: string; url: string }> {
    return this.uploadImageMaterial(imageUrl);
  }

  /**
   * 新建草稿
   * @param articles 图文消息数组
   */
  async createDraft(articles: WechatArticles[]): Promise<WechatDraftResult> {
    const token = await this.getToken();
    const url = `https://api.weixin.qq.com/cgi-bin/draft/add?access_token=${encodeURIComponent(token)}`;

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ articles }),
    });

    if (!resp.ok) {
      throw new Error(`WeChat draft/add failed: HTTP ${resp.status}`);
    }

    const data = (await resp.json()) as { media_id?: string; errcode?: number; errmsg?: string };

    if (!data.media_id) {
      throw new Error(`WeChat draft error: ${data.errcode} - ${data.errmsg}`);
    }

    return { media_id: data.media_id };
  }

  /**
   * 发布草稿
   * @param mediaId 草稿 media_id
   */
  async publishDraft(mediaId: string): Promise<WechatPublishResult> {
    const token = await this.getToken();
    const url = `https://api.weixin.qq.com/cgi-bin/freepublish/submit?access_token=${encodeURIComponent(token)}`;

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ media_id: mediaId }),
    });

    if (!resp.ok) {
      throw new Error(`WeChat publish failed: HTTP ${resp.status}`);
    }

    const data = (await resp.json()) as { publish_id?: string; errcode?: number; errmsg?: string };

    if (!data.publish_id) {
      throw new Error(`WeChat publish error: ${data.errcode} - ${data.errmsg}`);
    }

    return { publish_id: data.publish_id };
  }

  /**
   * 删除草稿
   * @param mediaId 草稿 media_id
   */
  async deleteDraft(mediaId: string): Promise<void> {
    const token = await this.getToken();
    const url = `https://api.weixin.qq.com/cgi-bin/draft/delete?access_token=${encodeURIComponent(token)}`;

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ media_id: mediaId }),
    });

    const data = (await resp.json()) as { errcode?: number; errmsg?: string };

    if (data.errcode && data.errcode !== 0) {
      throw new Error(`WeChat delete draft error: ${data.errcode} - ${data.errmsg}`);
    }
  }
}
