import { BaseAdapter } from '../adapter-base';
import { Comment, Credentials, DateRange, MetricsResult, Platform, PublishRequest, PublishResult } from '../types';
export interface WechatVideoConfig {
    clientKey: string;
    clientSecret: string;
    accountId: string;
}
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
    uploadVideo(mediaUrl: string): Promise<string>;
    publish(post: PublishRequest): Promise<PublishResult>;
    fetchMetrics(accountId: string, dateRange: DateRange): Promise<MetricsResult>;
    fetchComments(accountId: string, postId: string): Promise<Comment[]>;
}
