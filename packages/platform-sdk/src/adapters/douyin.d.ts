import { BaseAdapter } from '../adapter-base';
import { Credentials, DateRange, MetricsResult, Platform, PublishRequest, PublishResult } from '../types';
export interface DouyinConfig {
    clientKey: string;
    clientSecret: string;
    openId: string;
}
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
    uploadVideo(mediaUrl: string): Promise<string>;
    publish(post: PublishRequest): Promise<PublishResult>;
    fetchMetrics(accountId: string, dateRange: DateRange): Promise<MetricsResult>;
}
