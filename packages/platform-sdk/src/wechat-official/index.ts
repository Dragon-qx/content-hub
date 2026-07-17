/**
 * 微信公众号平台适配器
 * 提供 access_token 获取、素材管理、草稿管理、发布等功能
 */

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

export class WechatOfficialAdapter {
  private accessToken: string | null = null;
  private tokenExpireTime: number = 0;

  constructor(private config: WechatOfficialConfig) {}

  /**
   * 获取微信公众号 access_token
   * 会缓存 token，过期前自动刷新
   */
  async getAccessToken(): Promise<string> {
    // 如果 token 还有效，直接返回缓存
    if (this.accessToken && Date.now() < this.tokenExpireTime - 60000) {
      return this.accessToken;
    }

    const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(this.config.appid)}&secret=${encodeURIComponent(this.config.secret)}`;

    const resp = await fetch(url);
    if (!resp.ok) {
      throw new Error(`WeChat token request failed: HTTP ${resp.status}`);
    }

    const data = (await resp.json()) as { access_token?: string; expires_in?: number; errcode?: number; errmsg?: string };

    if (!data.access_token) {
      throw new Error(`WeChat API error: ${data.errcode} - ${data.errmsg}`);
    }

    this.accessToken = data.access_token;
    // 提前 60 秒过期，避免边界问题
    this.tokenExpireTime = Date.now() + (data.expires_in ?? 7200) * 1000;
    return this.accessToken;
  }

  /**
   * 获取粉丝总数
   * 注意：需要已认证的服务号
   */
  async getFollowerCount(): Promise<number> {
    const token = await this.getAccessToken();
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
    const token = await this.getAccessToken();
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
   * 添加永久图片素材
   * @param imageUrl 图片 URL（需要先上传到微信服务器）
   */
  async addImageMaterial(imageUrl: string): Promise<{ media_id: string; url: string }> {
    const token = await this.getAccessToken();
    const url = `https://api.weixin.qq.com/cgi-bin/material/add_material?access_token=${encodeURIComponent(token)}&type=image`;

    const resp = await fetch(url, {
      method: 'POST',
      body: JSON.stringify({ imageUrl }),
      headers: { 'Content-Type': 'application/json' },
    });

    const data = (await resp.json()) as { media_id?: string; url?: string; errcode?: number; errmsg?: string };

    if (!data.media_id) {
      throw new Error(`WeChat add material error: ${data.errcode} - ${data.errmsg}`);
    }

    return { media_id: data.media_id, url: data.url! };
  }

  /**
   * 新建草稿
   * @param articles 图文消息数组
   */
  async createDraft(articles: WechatArticles[]): Promise<WechatDraftResult> {
    const token = await this.getAccessToken();
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
    const token = await this.getAccessToken();
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
    const token = await this.getAccessToken();
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
