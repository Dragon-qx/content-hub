import { BaseAdapter } from '../adapter-base';
import { Credentials, DateRange, MetricsResult, Platform, PublishRequest, PublishResult } from '../types';
export interface WeiboConfig {
    appKey: string;
    appSecret: string;
    uid: string;
}
export declare class WeiboAdapter extends BaseAdapter {
    private config;
    platform: Platform;
    private accessToken;
    private tokenExpire;
    private refreshTokenValue;
    private uid;
    constructor(config: WeiboConfig);
    getAuthUrl(state: string): string;
    handleCallback(code: string): Promise<Credentials>;
    refreshToken(): Promise<Credentials>;
    private getToken;
    publish(post: PublishRequest): Promise<PublishResult>;
    fetchMetrics(accountId: string, dateRange: DateRange): Promise<MetricsResult>;
}
