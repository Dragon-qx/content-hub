import { Comment, Credentials, DateRange, Message, MetricsResult, Platform, PlatformAdapter, PublishRequest, PublishResult } from './types';
export declare abstract class BaseAdapter implements PlatformAdapter {
    abstract platform: Platform;
    private injectedToken;
    private injectedRefreshToken;
    private injectedTokenExpire;
    setCredentials(creds: {
        accessToken?: string | null;
        refreshToken?: string | null;
        expiresAt?: string | number | Date | null;
    }): void;
    protected callbackFor(platform?: Platform): string;
    protected hasInjectedToken(): boolean;
    protected getInjectedAccessToken(): string | null;
    protected getInjectedRefreshToken(): string | null;
    protected call<T>(url: string, init?: RequestInit): Promise<T>;
    protected callMultipart<T>(url: string, formData: FormData, extraHeaders?: Record<string, string>): Promise<T>;
    protected fetchMediaBytes(mediaUrl: string): Promise<ArrayBuffer>;
    abstract getAuthUrl(state: string): string;
    abstract handleCallback(code: string): Promise<Credentials>;
    refreshToken(): Promise<Credentials>;
    abstract publish(post: PublishRequest): Promise<PublishResult>;
    abstract fetchMetrics(accountId: string, dateRange: DateRange): Promise<MetricsResult>;
    fetchComments(accountId: string, postId: string): Promise<Comment[]>;
    replyToComment(_accountId: string, _commentId: string, _content: string): Promise<void>;
    fetchMessages(_accountId: string): Promise<Message[]>;
    replyToMessage(_accountId: string, _messageId: string, _content: string): Promise<void>;
}
