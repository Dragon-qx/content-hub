import { BaseAdapter } from '../adapter-base';
import { Comment, Credentials, DateRange, MetricsResult, Platform, PublishRequest, PublishResult } from '../types';
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
export declare class WechatVideoAdapter extends BaseAdapter {
    private config;
    platform: Platform;
    private accessToken;
    private tokenExpire;
    private refreshTokenValue;
    constructor(config: WechatVideoConfig);
    getAuthUrl(state: string): string;
    handleCallback(code: string): Promise<Credentials>;
    refreshToken(): Promise<Credentials>;
    private getToken;
    /**
     * Upload a video to WeChat Channels and return the media_id.
     * Real API: POST /channels/ec/basics/video/upload with multipart form.
     */
    uploadVideo(mediaUrl: string): Promise<string>;
    publish(post: PublishRequest): Promise<PublishResult>;
    fetchMetrics(accountId: string, dateRange: DateRange): Promise<MetricsResult>;
    fetchComments(accountId: string, postId: string): Promise<Comment[]>;
}
