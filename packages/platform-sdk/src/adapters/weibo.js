"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WeiboAdapter = void 0;
const adapter_base_1 = require("../adapter-base");
const types_1 = require("../types");
class WeiboAdapter extends adapter_base_1.BaseAdapter {
    constructor(config) {
        super();
        this.config = config;
        this.platform = types_1.Platform.WEIBO;
        this.accessToken = null;
        this.tokenExpire = 0;
        this.refreshTokenValue = null;
        this.uid = config.uid;
    }
    getAuthUrl(state) {
        const redirect = encodeURIComponent(this.callbackFor());
        return `https://api.weibo.com/oauth2/authorize?client_id=${encodeURIComponent(this.config.appKey)}&response_type=code&redirect_uri=${redirect}&state=${encodeURIComponent(state)}`;
    }
    async handleCallback(code) {
        const data = await this.call('https://api.weibo.com/oauth2/access_token', {
            method: 'POST',
            body: JSON.stringify({
                client_id: this.config.appKey,
                client_secret: this.config.appSecret,
                code,
                grant_type: 'authorization_code',
                redirect_uri: this.callbackFor(),
            }),
        });
        this.accessToken = data.access_token;
        this.refreshTokenValue = data.refresh_token;
        this.tokenExpire = Date.now() + data.expires_in * 1000;
        this.uid = data.uid;
        return {
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            expiresAt: new Date(this.tokenExpire),
        };
    }
    async refreshToken() {
        if (!this.refreshTokenValue)
            throw new Error('No refresh token for Weibo');
        const data = await this.call('https://api.weibo.com/oauth2/access_token', {
            method: 'POST',
            body: JSON.stringify({
                client_id: this.config.appKey,
                refresh_token: this.refreshTokenValue,
                grant_type: 'refresh_token',
            }),
        });
        this.accessToken = data.access_token;
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
        throw new Error('Weibo adapter is not authenticated');
    }
    async publish(post) {
        const token = await this.getToken();
        const data = await this.call('https://api.weibo.com/2/statuses/share.json', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: JSON.stringify({ status: `${post.content} ${post.extra?.url ?? ''}`.trim() }),
        });
        return {
            externalId: data.idstr,
            externalUrl: data.url ?? `https://weibo.com/${this.uid}/${data.idstr}`,
            publishedAt: new Date(),
        };
    }
    async fetchMetrics(accountId, dateRange) {
        const token = await this.getToken();
        const data = await this.call(`https://api.weibo.com/2/users/show.json?access_token=${encodeURIComponent(token)}&uid=${encodeURIComponent(this.uid)}`);
        return {
            impressions: 0,
            engagements: 0,
            likes: 0,
            comments: 0,
            shares: 0,
            views: 0,
            followerCount: data.followers_count ?? 0,
        };
    }
}
exports.WeiboAdapter = WeiboAdapter;
//# sourceMappingURL=weibo.js.map