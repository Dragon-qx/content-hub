import { BaseAdapter } from '../adapter-base';
import { Comment, Credentials, DateRange, MetricsResult, Platform, PublishRequest, PublishResult } from '../types';
export interface YouTubeConfig {
    /** OAuth2 client id of the Google Cloud project. */
    clientId: string;
    /** OAuth2 client secret of the Google Cloud project. */
    clientSecret: string;
    /** YouTube channel id the account publishes as. */
    channelId?: string;
}
/**
 * YouTube adapter — OAuth2 Authorization Code flow + YouTube Data API v3.
 * See: https://developers.google.com/youtube/v3/docs
 *
 * Capabilities: auth, publish (the metadata create — the binary upload is a
 * separate resumable-upload step the platform requires), channel metrics, and
 * comment threads (fetch + reply). YouTube has no inbox-style DM surface, so
 * fetchMessages falls back to the BaseAdapter "not supported" error.
 */
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
    /**
     * Register upload metadata. YouTube requires a multipart resumable upload for
     * the video binary first; this call creates the video resource (the scaffold
     * the binary is attached to) so the external id + url exist immediately.
     */
    publish(post: PublishRequest): Promise<PublishResult>;
    fetchMetrics(accountId: string, dateRange: DateRange): Promise<MetricsResult>;
    fetchComments(accountId: string, postId: string): Promise<Comment[]>;
    replyToComment(accountId: string, commentId: string, content: string): Promise<void>;
}
