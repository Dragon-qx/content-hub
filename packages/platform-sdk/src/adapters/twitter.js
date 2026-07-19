"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TwitterAdapter = void 0;
const adapter_base_1 = require("../adapter-base");
const types_1 = require("../types");
class TwitterAdapter extends adapter_base_1.BaseAdapter {
    constructor(config) {
        super();
        this.config = config;
        this.platform = types_1.Platform.TWITTER;
        this.accessToken = null;
        this.tokenExpire = 0;
        this.refreshTokenValue = null;
        this.userId = config.userId ?? '';
    }
    getAuthUrl(state) {
        const redirect = encodeURIComponent(this.callbackFor());
        const challenge = 'challenge';
        return `https://twitter.com/i/oauth2/authorize?response_type=code&client_id=${encodeURIComponent(this.config.clientKey)}&redirect_uri=${redirect}&scope=tweet.read%20tweet.write%20users.read%20offline.access&state=${encodeURIComponent(state)}&code_challenge=${challenge}&code_challenge_method=S256`;
    }
    async handleCallback(code) {
        const data = await this.call('https://api.twitter.com/2/oauth2/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                ...basicAuth(this.config.clientKey, this.config.clientSecret),
            },
            body: new URLSearchParams({
                code,
                grant_type: 'authorization_code',
                redirect_uri: this.callbackFor(),
                code_verifier: 'verifier',
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
            throw new Error('No refresh token for Twitter');
        const data = await this.call('https://api.twitter.com/2/oauth2/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                ...basicAuth(this.config.clientKey, this.config.clientSecret),
            },
            body: new URLSearchParams({
                refresh_token: this.refreshTokenValue,
                grant_type: 'refresh_token',
            }).toString(),
        });
        this.accessToken = data.access_token;
        this.refreshTokenValue = data.refresh_token ?? this.refreshTokenValue;
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
        throw new Error('Twitter adapter is not authenticated');
    }
    async publish(post) {
        const token = await this.getToken();
        const data = await this.call('https://api.twitter.com/2/tweets', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: JSON.stringify({ text: post.content }),
        });
        return {
            externalId: data.data.id,
            externalUrl: `https://twitter.com/${this.userId}/status/${data.data.id}`,
            publishedAt: new Date(),
        };
    }
    async fetchMetrics(accountId, dateRange) {
        const token = await this.getToken();
        const data = await this.call(`https://api.twitter.com/2/users/${encodeURIComponent(this.userId || accountId)}?user.fields=public_metrics`, { headers: { Authorization: `Bearer ${token}` } });
        const pm = data.data?.public_metrics ?? {};
        return {
            impressions: 0,
            engagements: 0,
            likes: 0,
            comments: 0,
            shares: 0,
            views: 0,
            followerCount: pm.followers_count ?? 0,
        };
    }
}
exports.TwitterAdapter = TwitterAdapter;
function basicAuth(key, secret) {
    return { Authorization: `Basic ${globalThis.btoa(`${key}:${secret}`)}` };
}
//# sourceMappingURL=twitter.js.map