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
    handleCallback(): Promise<{
        accessToken: string;
        expiresAt: Date;
    }>;
    getAccessToken(): Promise<string>;
    private getToken;
    publish(post: PublishRequest): Promise<PublishResult>;
    fetchMetrics(): Promise<MetricsResult>;
    getFollowerCount(): Promise<number>;
    getMaterials(type?: string, offset?: number, count?: number): Promise<WechatMaterialResult>;
    uploadImageMaterial(imageUrl: string): Promise<{
        media_id: string;
        url: string;
    }>;
    addImageMaterial(imageUrl: string): Promise<{
        media_id: string;
        url: string;
    }>;
    createDraft(articles: WechatArticles[]): Promise<WechatDraftResult>;
    publishDraft(mediaId: string): Promise<WechatPublishResult>;
    deleteDraft(mediaId: string): Promise<void>;
}
