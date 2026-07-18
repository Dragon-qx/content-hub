import { Comment, Credentials, DateRange, Message, MetricsResult, Platform, PlatformAdapter, PublishRequest, PublishResult } from './types';
/**
 * Shared helpers and sensible defaults for every ConcreteAdapter.
 * Platform-specific adapters extend this class and override the operations
 * that the platform's API actually supports. Operations that a platform does
 * not implement throw a clear, typed error so callers can branch on it.
 */
export declare abstract class BaseAdapter implements PlatformAdapter {
    abstract platform: Platform;
    /**
     * Token injected from stored credentials (e.g. a persisted OAuth access
     * token). When present, adapters use it instead of performing a live
     * OAuth handshake. `expiresAt` defaults to ~1h out if omitted.
     */
    private injectedToken;
    private injectedRefreshToken;
    private injectedTokenExpire;
    /** Seed the adapter with credentials already stored for the account. */
    setCredentials(creds: {
        accessToken?: string | null;
        refreshToken?: string | null;
        expiresAt?: string | number | Date | null;
    }): void;
    /**
     * OAuth2 callback URL for this platform, derived from the shared
     * OAUTH_CALLBACK_BASE (so new deployments stop hard-coding
     * `https://your-domain.com`). Subclasses call this from getAuthUrl /
     * handleCallback instead of inlining the host.
     */
    protected callbackFor(platform?: Platform): string;
    /** True when the adapter can publish without a fresh OAuth handshake. */
    protected hasInjectedToken(): boolean;
    protected getInjectedAccessToken(): string | null;
    protected getInjectedRefreshToken(): string | null;
    /** Perform an authenticated fetch against the platform API. */
    protected call<T>(url: string, init?: RequestInit): Promise<T>;
    /**
     * Perform a multipart/form-data upload against the platform API.
     * Does NOT set Content-Type header (browser/fetch will set the boundary).
     */
    protected callMultipart<T>(url: string, formData: FormData, extraHeaders?: Record<string, string>): Promise<T>;
    /** Fetch media bytes from a URL (HTTP/HTTPS) or local path. */
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
