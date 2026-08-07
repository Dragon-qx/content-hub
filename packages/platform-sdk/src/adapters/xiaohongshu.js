"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.XiaoHongShuAdapter = void 0;
const crypto_1 = require("crypto");
const adapter_base_1 = require("../adapter-base");
const types_1 = require("../types");
class XiaoHongShuAdapter extends adapter_base_1.BaseAdapter {
    constructor(config) {
        super();
        this.config = config;
        this.platform = types_1.Platform.XIAOHONGSHU;
        this.accessToken = null;
        this.tokenExpire = 0;
        this.refreshTokenValue = null;
    }
    sign(body) {
        return (0, crypto_1.createHmac)('sha256', this.config.appSecret).update(body).digest('hex');
    }
    getAuthUrl(state) {
        const redirect = encodeURIComponent(this.callbackFor());
        return `https://customer.xiaohongshu.com/api/oauth/v1/authorize?app_key=${encodeURIComponent(this.config.appKey)}&redirect_uri=${redirect}&response_type=code&state=${encodeURIComponent(state)}`;
    }
    async handleCallback(code) {
        const payload = JSON.stringify({ app_key: this.config.appKey, app_secret: this.config.appSecret, code, grant_type: 'authorization_code' });
        const data = await this.call('https://customer.xiaohongshu.com/api/oauth/v1/token', { method: 'POST', headers: { 'X-Signature': this.sign(payload) }, body: payload });
        this.accessToken = data.access_token;
        if (data.refresh_token)
            this.refreshTokenValue = data.refresh_token;
        this.tokenExpire = Date.now() + data.expires_in * 1000;
        return {
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            expiresAt: new Date(this.tokenExpire),
        };
    }
    async refreshToken() {
        if (!this.refreshTokenValue)
            throw new Error('No refresh token for XiaoHongShu');
        const payload = JSON.stringify({
            app_key: this.config.appKey,
            app_secret: this.config.appSecret,
            refresh_token: this.refreshTokenValue,
            grant_type: 'refresh_token',
        });
        const data = await this.call('https://customer.xiaohongshu.com/api/oauth/v1/token', { method: 'POST', headers: { 'X-Signature': this.sign(payload) }, body: payload });
        this.accessToken = data.access_token;
        if (data.refresh_token)
            this.refreshTokenValue = data.refresh_token;
        this.tokenExpire = Date.now() + data.expires_in * 1000;
        return {
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            expiresAt: new Date(this.tokenExpire),
        };
    }
    async getToken() {
        const injected = this.getInjectedAccessToken();
        if (injected)
            return injected;
        if (this.accessToken && Date.now() < this.tokenExpire - 60000)
            return this.accessToken;
        if (this.refreshTokenValue)
            return (await this.refreshToken()).accessToken;
        throw new Error('XiaoHongShu adapter is not authenticated');
    }
    async uploadMedia(mediaUrl, type = 'image') {
        const token = await this.getToken();
        const bytes = await this.fetchMediaBytes(mediaUrl);
        const form = new FormData();
        form.append('file', new Blob([bytes], { type: type === 'video' ? 'video/mp4' : 'image/jpeg' }), type === 'video' ? 'media.mp4' : 'media.jpg');
        form.append('type', type);
        const payload = JSON.stringify({ type, timestamp: Date.now() });
        const data = await this.callMultipart(`https://customer.xiaohongshu.com/api/media/v1/upload`, form, { Authorization: `Bearer ${token}`, 'X-Signature': this.sign(payload) });
        return data.media_url;
    }
    async publish(post) {
        const token = await this.getToken();
        let mediaUrls = post.mediaUrls ?? [];
        if (mediaUrls.length > 0) {
            const type = mediaUrls[0].match(/\.(mp4|mov|avi)$/i) ? 'video' : 'image';
            mediaUrls = await Promise.all(mediaUrls.map(url => this.uploadMedia(url, type)));
        }
        const payload = JSON.stringify({ title: post.content.slice(0, 20), content: post.content, media_urls: mediaUrls });
        const data = await this.call(`https://customer.xiaohongshu.com/api/notes/v1/publish`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'X-Signature': this.sign(payload) }, body: payload });
        return { externalId: data.note_id, externalUrl: `https://www.xiaohongshu.com/explore/${data.note_id}`, publishedAt: new Date() };
    }
    async fetchMetrics(accountId, dateRange) {
        const token = await this.getToken();
        const payload = JSON.stringify({ account_id: accountId, start: dateRange.start.toISOString(), end: dateRange.end.toISOString() });
        const data = await this.call(`https://customer.xiaohongshu.com/api/insights/v1/overview`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'X-Signature': this.sign(payload) }, body: payload });
        const d = data.data;
        return {
            impressions: d.exposure ?? 0,
            engagements: (d.like ?? 0) + (d.collect ?? 0) + (d.comment ?? 0),
            likes: d.like ?? 0,
            comments: d.comment ?? 0,
            shares: d.share ?? 0,
            views: d.view ?? 0,
            followerCount: d.fans ?? 0,
        };
    }
}
exports.XiaoHongShuAdapter = XiaoHongShuAdapter;
//# sourceMappingURL=xiaohongshu.js.map