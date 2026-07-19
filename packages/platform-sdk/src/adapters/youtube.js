"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.YouTubeAdapter = void 0;
const adapter_base_1 = require("../adapter-base");
const types_1 = require("../types");
class YouTubeAdapter extends adapter_base_1.BaseAdapter {
    constructor(config) {
        super();
        this.config = config;
        this.platform = types_1.Platform.YOUTUBE;
        this.accessToken = null;
        this.tokenExpire = 0;
        this.refreshTokenValue = null;
        this.channelId = config.channelId ?? '';
    }
    getAuthUrl(state) {
        const redirect = encodeURIComponent(this.callbackFor());
        return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(this.config.clientId)}&redirect_uri=${redirect}&response_type=code&scope=${encodeURIComponent('https://www.googleapis.com/auth/youtube https://www.googleapis.com/auth/youtube.force-ssl')}&access_type=offline&prompt=consent&state=${encodeURIComponent(state)}`;
    }
    async handleCallback(code) {
        const data = await this.call('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                code,
                client_id: this.config.clientId,
                client_secret: this.config.clientSecret,
                grant_type: 'authorization_code',
                redirect_uri: this.callbackFor(),
            }).toString(),
        });
        this.accessToken = data.access_token;
        this.refreshTokenValue = data.refresh_token ?? null;
        this.tokenExpire = Date.now() + data.expires_in * 1000;
        return {
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            expiresAt: new Date(this.tokenExpire),
        };
    }
    async refreshToken() {
        if (!this.refreshTokenValue)
            throw new Error('No refresh token for YouTube');
        const data = await this.call('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                refresh_token: this.refreshTokenValue,
                client_id: this.config.clientId,
                client_secret: this.config.clientSecret,
                grant_type: 'refresh_token',
            }).toString(),
        });
        this.accessToken = data.access_token;
        this.tokenExpire = Date.now() + data.expires_in * 1000;
        return {
            accessToken: data.access_token,
            refreshToken: this.refreshTokenValue,
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
        throw new Error('YouTube adapter is not authenticated');
    }
    async publish(post) {
        const token = await this.getToken();
        const data = await this.call('https://www.googleapis.com/upload/youtube/v3/videos?part=snippet,status&uploadType=resumable', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'X-Upload-Content-Type': 'video/*',
            },
            body: JSON.stringify({
                snippet: { title: post.extra?.title ?? 'Untitled', description: post.content },
                status: { privacyStatus: 'private' },
            }),
        });
        return {
            externalId: data.id,
            externalUrl: `https://youtu.be/${data.id}`,
            publishedAt: new Date(),
        };
    }
    async fetchMetrics(accountId, dateRange) {
        const token = await this.getToken();
        const id = this.channelId || accountId;
        const data = await this.call(`https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${encodeURIComponent(id)}`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        const stats = data.items?.[0]?.statistics ?? {};
        const n = (v) => typeof v === 'number' ? v : typeof v === 'string' && v ? parseInt(v, 10) || 0 : 0;
        return {
            impressions: 0,
            engagements: 0,
            likes: 0,
            comments: 0,
            shares: 0,
            views: n(stats.viewCount),
            followerCount: n(stats.subscriberCount),
        };
    }
    async fetchComments(accountId, postId) {
        const token = await this.getToken();
        const data = await this.call(`https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${encodeURIComponent(postId)}&maxResults=50&textFormat=plainText`, { headers: { Authorization: `Bearer ${token}` } });
        return (data.items ?? []).map((t) => ({
            id: t.id,
            authorId: t.snippet.authorChannelId?.value ?? '',
            authorName: t.snippet.authorDisplayName,
            content: t.snippet.textDisplay,
            createdAt: new Date(t.snippet.publishedAt),
        }));
    }
    async replyToComment(accountId, commentId, content) {
        const token = await this.getToken();
        await this.call('https://www.googleapis.com/youtube/v3/comments?part=snippet', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: JSON.stringify({
                snippet: {
                    parentId: commentId,
                    textOriginal: content,
                },
            }),
        });
    }
}
exports.YouTubeAdapter = YouTubeAdapter;
//# sourceMappingURL=youtube.js.map