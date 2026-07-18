import { BaseAdapter } from '../adapter-base';
import { Credentials, DateRange, MetricsResult, Platform, PublishRequest, PublishResult } from '../types';
export interface DouyinConfig {
    clientKey: string;
    clientSecret: string;
    openId: string;
}
/**
 * 抖音开放平台 (Douyin) adapter.
 * See: https://open.douyin.com/platform/doc?doc=docs/open-interface Logistics/user-authorization
 */
export declare class DouyinAdapter extends BaseAdapter {
    private config;
    platform: Platform;
    private accessToken;
    private tokenExpire;
    private refreshTokenValue;
    constructor(config: DouyinConfig);
    getAuthUrl(state: string): string;
    handleCallback(code: string): Promise<Credentials>;
    refreshToken(): Promise<Credentials>;
    private getToken;
    /**
     * Upload a video to Douyin and return the video_id.
     * Real API: POST /api/apps/v1/video/upload/ with multipart form.
     */
    uploadVideo(mediaUrl: string): Promise<string>;
    publish(post: PublishRequest): Promise<PublishResult>;
    fetchMetrics(accountId: string, dateRange: DateRange): Promise<MetricsResult>;
}
