import { BaseAdapter } from '../adapter-base';
import { Credentials, DateRange, MetricsResult, Platform, PublishRequest, PublishResult } from '../types';
export interface TwitterConfig {
    clientKey: string;
    clientSecret: string;
    /** OAuth2 user id (author_id) resolved at code exchange. */
    userId?: string;
}
/**
 * X (Twitter) adapter — OAuth2 Authorization Code flow + X API v2.
 * See: https://developer.twitter.com/en/docs/twitter-api
 *
 * Capabilities: auth, publish, and account-level metrics. X's v2 free tier does
 * not expose an impressions/engagement endpoint, so those counters are left at
 * 0. Comments (quote tweets / replies threading) and DMs are not surfaced — the
 * BaseAdapter defaults throw a clear "not supported" error the engagement
 * layer branches on.
 */
export declare class TwitterAdapter extends BaseAdapter {
    private config;
    platform: Platform;
    private accessToken;
    private tokenExpire;
    private refreshTokenValue;
    private userId;
    constructor(config: TwitterConfig);
    getAuthUrl(state: string): string;
    handleCallback(code: string): Promise<Credentials>;
    refreshToken(): Promise<Credentials>;
    private getToken;
    publish(post: PublishRequest): Promise<PublishResult>;
    fetchMetrics(accountId: string, dateRange: DateRange): Promise<MetricsResult>;
}
