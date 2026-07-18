import { BaseAdapter } from '../adapter-base';
import { Comment, Credentials, DateRange, Message, MetricsResult, Platform, PublishRequest, PublishResult } from '../types';
export interface BilibiliConfig {
    accessKey: string;
    secretKey: string;
    accountId: string;
}
/**
 * B站 (Bilibili) 开放平台 adapter — 创作姬 / 个人空间发布能力。
 * See: https://open.bilibili.com/doc
 */
export declare class BilibiliAdapter extends BaseAdapter {
    private config;
    platform: Platform;
    private accessToken;
    private tokenExpire;
    private refreshTokenValue;
    constructor(config: BilibiliConfig);
    getAuthUrl(state: string): string;
    handleCallback(code: string): Promise<Credentials>;
    refreshToken(): Promise<Credentials>;
    private getToken;
    publish(post: PublishRequest): Promise<PublishResult>;
    fetchMetrics(accountId: string, dateRange: DateRange): Promise<MetricsResult>;
    fetchComments(accountId: string, postId: string): Promise<Comment[]>;
    replyToComment(accountId: string, commentId: string, message: string): Promise<void>;
    replyToMessage(accountId: string, messageId: string, content: string): Promise<void>;
    fetchMessages(accountId: string): Promise<Message[]>;
}
