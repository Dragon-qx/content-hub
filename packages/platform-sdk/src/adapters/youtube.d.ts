import { BaseAdapter } from '../adapter-base';
import { Comment, Credentials, DateRange, MetricsResult, Platform, PublishRequest, PublishResult } from '../types';
export interface YouTubeConfig {
    clientId: string;
    clientSecret: string;
    channelId?: string;
}
export declare class YouTubeAdapter extends BaseAdapter {
    private config;
    platform: Platform;
    private accessToken;
    private tokenExpire;
    private refreshTokenValue;
    private channelId;
    constructor(config: YouTubeConfig);
    getAuthUrl(state: string): string;
    handleCallback(code: string): Promise<Credentials>;
    refreshToken(): Promise<Credentials>;
    private getToken;
    publish(post: PublishRequest): Promise<PublishResult>;
    fetchMetrics(accountId: string, dateRange: DateRange): Promise<MetricsResult>;
    fetchComments(accountId: string, postId: string): Promise<Comment[]>;
    replyToComment(accountId: string, commentId: string, content: string): Promise<void>;
}
