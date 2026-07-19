"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DouyinAdapter = void 0;
const adapter_base_1 = require("../adapter-base");
const types_1 = require("../types");
class DouyinAdapter extends adapter_base_1.BaseAdapter {
    constructor(config) {
        super();
        this.config = config;
        this.platform = types_1.Platform.DOUYIN;
        this.accessToken = null;
        this.tokenExpire = 0;
        this.refreshTokenValue = null;
    }
    getAuthUrl(state) {
        const redirect = encodeURIComponent(this.callbackFor());
        return `https://open.douyin.com/platform/oauth/connect?client_key=${encodeURIComponent(this.config.clientKey)}&response_type=code&scope=user_info,video.list,video.create&redirect_uri=${redirect}&state=${encodeURIComponent(state)}`;
    }
    async handleCallback(code) {
        const data = await this.call('https://open.douyin.com/oauth/access_token/', { method: 'POST', body: JSON.stringify({ client_key: this.config.clientKey, client_secret: this.config.clientSecret, code, grant_type: 'authorization_code' }) });
        const inner = data.data;
        this.accessToken = inner.access_token;
        this.refreshTokenValue = inner.refresh_token;
        this.tokenExpire = Date.now() + inner.expires_in * 1000;
        return { accessToken: inner.access_token, refreshToken: inner.refresh_token, expiresAt: new Date(this.tokenExpire) };
    }
    async refreshToken() {
        if (!this.refreshTokenValue)
            throw new Error('No refresh token for Douyin');
        const data = await this.call('https://open.douyin.com/oauth/refresh_token/', { method: 'POST', body: JSON.stringify({ client_key: this.config.clientKey, refresh_token: this.refreshTokenValue }) });
        this.accessToken = data.data.access_token;
        this.tokenExpire = Date.now() + data.data.expires_in * 1000;
        return { accessToken: data.data.access_token, refreshToken: this.refreshTokenValue, expiresAt: new Date(this.tokenExpire) };
    }
    async getToken() {
        const injected = this.getInjectedAccessToken();
        if (injected)
            return injected;
        if (this.accessToken && Date.now() < this.tokenExpire - 60000)
            return this.accessToken;
        if (this.refreshTokenValue)
            return (await this.refreshToken()).accessToken;
        throw new Error('Douyin adapter is not authenticated');
    }
    async uploadVideo(mediaUrl) {
        const token = await this.getToken();
        const bytes = await this.fetchMediaBytes(mediaUrl);
        const form = new FormData();
        form.append('video', new Blob([bytes], { type: 'video/mp4' }), 'video.mp4');
        const data = await this.callMultipart(`https://open.douyin.com/api/apps/v1/video/upload/?open_id=${encodeURIComponent(this.config.openId)}&access_token=${encodeURIComponent(token)}`, form);
        return data.data.video_id;
    }
    async publish(post) {
        const token = await this.getToken();
        let videoId = '';
        if (post.mediaUrls?.length) {
            videoId = await this.uploadVideo(post.mediaUrls[0]);
        }
        const data = await this.call(`https://open.douyin.com/api/apps/v1/video/create/?open_id=${encodeURIComponent(this.config.openId)}&access_token=${encodeURIComponent(token)}`, { method: 'POST', body: JSON.stringify({ text: post.content, video_id: videoId }) });
        return { externalId: data.data.item_id, externalUrl: data.data.share_url, publishedAt: new Date() };
    }
    async fetchMetrics(accountId, dateRange) {
        const token = await this.getToken();
        const data = await this.call(`https://open.douyin.com/api/apps/v1/data/extern/fans/?open_id=${encodeURIComponent(this.config.openId)}&access_token=${encodeURIComponent(token)}`);
        const s = data.data.statistics;
        return {
            impressions: s.total_play ?? 0,
            engagements: (s.total_like ?? 0) + (s.total_comment ?? 0) + (s.total_share ?? 0),
            likes: s.total_like ?? 0,
            comments: s.total_comment ?? 0,
            shares: s.total_share ?? 0,
            views: s.total_play ?? 0,
            followerCount: s.total_fans ?? 0,
        };
    }
}
exports.DouyinAdapter = DouyinAdapter;
//# sourceMappingURL=douyin.js.map