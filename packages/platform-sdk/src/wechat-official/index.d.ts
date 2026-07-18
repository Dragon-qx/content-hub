/**
 * 微信公众号平台适配器
 * 提供 access_token 获取、素材管理、草稿管理、发布等功能。
 *
 * Extends BaseAdapter so it honours the PlatformAdapter contract (publish /
 * fetchMetrics) and can also be seeded with a pre-existing token via
 * setCredentials().
 */
import { BaseAdapter } from '../adapter-base';
import { MetricsResult, Platform, PublishRequest, PublishResult } from '../types';
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
export declare class WechatOfficialAdapter extends BaseAdapter {
    private config;
    platform: Platform;
    private accessToken;
    private tokenExpireTime;
    constructor(config: WechatOfficialConfig);
    getAuthUrl(state: string): string;
    /** WeChat Official uses the client_credential grant; this derives the token. */
    handleCallback(): Promise<{
        accessToken: string;
        expiresAt: Date;
    }>;
    /**
     * 获取微信公众号 access_token
     * 会缓存 token，过期前自动刷新。优先使用注入的已存 token。
     */
    getAccessToken(): Promise<string>;
    /** 兼容 BaseAdapter 的 getToken 管道：delegate 到 client-credential 流程。 */
    private getToken;
    /**
     * Publish a post: create a multimedia draft then submit it.
     *
     * WeChat requires a thumb_media_id (permanent image material) for every
     * article draft. If `post.mediaUrls` is supplied the first URL is uploaded
     * via the real `/cgi-bin/material/add_material` multipart endpoint and its
     * returned media_id is used. Without a cover image the call throws because
     * WeChat will reject a draft with a placeholder thumb.
     */
    publish(post: PublishRequest): Promise<PublishResult>;
    fetchMetrics(): Promise<MetricsResult>;
    /**
     * 获取粉丝总数
     * 注意：需要已认证的服务号
     */
    getFollowerCount(): Promise<number>;
    /**
     * 获取素材列表
     * @param type 素材类型：image/video/voice/news
     * @param offset 偏移量
     * @param count 数量
     */
    getMaterials(type?: string, offset?: number, count?: number): Promise<WechatMaterialResult>;
    /**
     * Upload a permanent image material via the real WeChat multipart endpoint.
     *
     * The WeChat API requires multipart/form-data with the raw image bytes (not
     * a JSON body). This method fetches the image from `imageUrl` and POSTs it
     * to `/cgi-bin/material/add_material?type=image`.
     */
    uploadImageMaterial(imageUrl: string): Promise<{
        media_id: string;
        url: string;
    }>;
    /**
     * @deprecated Use {@link uploadImageMaterial} which uses the real multipart endpoint.
     */
    addImageMaterial(imageUrl: string): Promise<{
        media_id: string;
        url: string;
    }>;
    /**
     * 新建草稿
     * @param articles 图文消息数组
     */
    createDraft(articles: WechatArticles[]): Promise<WechatDraftResult>;
    /**
     * 发布草稿
     * @param mediaId 草稿 media_id
     */
    publishDraft(mediaId: string): Promise<WechatPublishResult>;
    /**
     * 删除草稿
     * @param mediaId 草稿 media_id
     */
    deleteDraft(mediaId: string): Promise<void>;
}
