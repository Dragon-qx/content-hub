import { BaseAdapter } from '../adapter-base';
import { Credentials, DateRange, MetricsResult, Platform, PublishRequest, PublishResult } from '../types';
export interface XiaoHongShuConfig {
    appKey: string;
    appSecret: string;
    accountId: string;
}
/**
 * 小红书专业号 (XiaoHongShu / Red) open-platform adapter.
 * Note: the real API uses request signing (signature = HMAC-SHA256 of the
 * canonical request); we mirror that shape here so a real integration only
 * needs real credentials and hostnames.
 * See: https://open.xiaohongshu.com/document/doc?docId=64f1b21a00000000
 */
export declare class XiaoHongShuAdapter extends BaseAdapter {
    private config;
    platform: Platform;
    private accessToken;
    private tokenExpire;
    private refreshTokenValue;
    constructor(config: XiaoHongShuConfig);
    /** Sign a request body per the Red open-platform spec. */
    private sign;
    getAuthUrl(state: string): string;
    handleCallback(code: string): Promise<Credentials>;
    refreshToken(): Promise<Credentials>;
    private getToken;
    /**
     * Upload media to XiaoHongShu and return the platform media URL.
     * Real API: POST /api/media/v1/upload with HMAC signature.
     */
    uploadMedia(mediaUrl: string, type?: 'image' | 'video'): Promise<string>;
    publish(post: PublishRequest): Promise<PublishResult>;
    fetchMetrics(accountId: string, dateRange: DateRange): Promise<MetricsResult>;
}
