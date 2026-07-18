"use strict";
/**
 * 微信公众号平台适配器
 * 提供 access_token 获取、素材管理、草稿管理、发布等功能。
 *
 * Extends BaseAdapter so it honours the PlatformAdapter contract (publish /
 * fetchMetrics) and can also be seeded with a pre-existing token via
 * setCredentials().
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.WechatOfficialAdapter = void 0;
const adapter_base_1 = require("../adapter-base");
const types_1 = require("../types");
class WechatOfficialAdapter extends adapter_base_1.BaseAdapter {
    constructor(config) {
        super();
        this.config = config;
        this.platform = types_1.Platform.WECHAT_OFFICIAL;
        this.accessToken = null;
        this.tokenExpireTime = 0;
    }
    getAuthUrl(state) {
        const redirect = encodeURIComponent(this.callbackFor());
        return `https://open.weixin.qq.com/connect/oauth2/authorize?appid=${encodeURIComponent(this.config.appid)}&redirect_uri=${redirect}&response_type=code&scope=snsapi_base&state=${encodeURIComponent(state)}#wechat_redirect`;
    }
    /** WeChat Official uses the client_credential grant; this derives the token. */
    async handleCallback() {
        const token = await this.getAccessToken();
        return { accessToken: token, expiresAt: new Date(this.tokenExpireTime) };
    }
    /**
     * 获取微信公众号 access_token
     * 会缓存 token，过期前自动刷新。优先使用注入的已存 token。
     */
    async getAccessToken() {
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
        const data = (await resp.json());
        if (!data.access_token) {
            throw new Error(`WeChat API error: ${data.errcode} - ${data.errmsg}`);
        }
        this.accessToken = data.access_token;
        // 提前 60 秒过期，避免边界问题
        this.tokenExpireTime = Date.now() + (data.expires_in ?? 7200) * 1000;
        return this.accessToken;
    }
    /** 兼容 BaseAdapter 的 getToken 管道：delegate 到 client-credential 流程。 */
    async getToken() {
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
    async publish(post) {
        const title = post.extra?.title ?? 'Untitled';
        const thumbUrl = post.mediaUrls?.[0];
        if (!thumbUrl) {
            throw new Error('WeChat Official requires a cover image (thumb) — pass mediaUrls[0]');
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
    async fetchMetrics() {
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
    async getFollowerCount() {
        const token = await this.getToken();
        const url = `https://api.weixin.qq.com/cgi-bin/user/get?access_token=${encodeURIComponent(token)}`;
        const resp = await fetch(url);
        if (!resp.ok) {
            throw new Error(`WeChat user/get failed: HTTP ${resp.status}`);
        }
        const data = (await resp.json());
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
    async getMaterials(type = 'news', offset = 0, count = 20) {
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
        const data = (await resp.json());
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
    async uploadImageMaterial(imageUrl) {
        const token = await this.getToken();
        const bytes = await this.fetchMediaBytes(imageUrl);
        const form = new FormData();
        form.append('media', new Blob([bytes], { type: 'image/jpeg' }), 'cover.jpg');
        const data = await this.callMultipart(`https://api.weixin.qq.com/cgi-bin/material/add_material?access_token=${encodeURIComponent(token)}&type=image`, form);
        if (!data.media_id) {
            throw new Error('WeChat add material returned no media_id');
        }
        return { media_id: data.media_id, url: data.url };
    }
    /**
     * @deprecated Use {@link uploadImageMaterial} which uses the real multipart endpoint.
     */
    async addImageMaterial(imageUrl) {
        return this.uploadImageMaterial(imageUrl);
    }
    /**
     * 新建草稿
     * @param articles 图文消息数组
     */
    async createDraft(articles) {
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
        const data = (await resp.json());
        if (!data.media_id) {
            throw new Error(`WeChat draft error: ${data.errcode} - ${data.errmsg}`);
        }
        return { media_id: data.media_id };
    }
    /**
     * 发布草稿
     * @param mediaId 草稿 media_id
     */
    async publishDraft(mediaId) {
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
        const data = (await resp.json());
        if (!data.publish_id) {
            throw new Error(`WeChat publish error: ${data.errcode} - ${data.errmsg}`);
        }
        return { publish_id: data.publish_id };
    }
    /**
     * 删除草稿
     * @param mediaId 草稿 media_id
     */
    async deleteDraft(mediaId) {
        const token = await this.getToken();
        const url = `https://api.weixin.qq.com/cgi-bin/draft/delete?access_token=${encodeURIComponent(token)}`;
        const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ media_id: mediaId }),
        });
        const data = (await resp.json());
        if (data.errcode && data.errcode !== 0) {
            throw new Error(`WeChat delete draft error: ${data.errcode} - ${data.errmsg}`);
        }
    }
}
exports.WechatOfficialAdapter = WechatOfficialAdapter;
//# sourceMappingURL=index.js.map