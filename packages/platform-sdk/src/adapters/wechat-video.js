"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WechatVideoAdapter = void 0;
const adapter_base_1 = require("../adapter-base");
const types_1 = require("../types");
class WechatVideoAdapter extends adapter_base_1.BaseAdapter {
    constructor(config) {
        super();
        this.config = config;
        this.platform = types_1.Platform.WECHAT_VIDEO;
        this.accessToken = null;
        this.tokenExpire = 0;
        this.refreshTokenValue = null;
    }
    getAuthUrl(state) {
        const redirect = encodeURIComponent(this.callbackFor());
        return `https://open.weixin.qq.com/connect/qrconnect?appid=${encodeURIComponent(this.config.clientKey)}&redirect_uri=${redirect}&response_type=code&scope=snsapi_login&state=${encodeURIComponent(state)}#wechat_redirect`;
    }
    async handleCallback(code) {
        const data = await this.call(`https://api.weixin.qq.com/sns/oauth2/access_token?appid=${encodeURIComponent(this.config.clientKey)}&secret=${encodeURIComponent(this.config.clientSecret)}&code=${encodeURIComponent(code)}&grant_type=authorization_code`);
        this.accessToken = data.access_token;
        this.refreshTokenValue = data.refresh_token;
        this.tokenExpire = Date.now() + data.expires_in * 1000;
        return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt: new Date(this.tokenExpire) };
    }
    async refreshToken() {
        if (!this.refreshTokenValue)
            throw new Error('No refresh token available for WeChat Video');
        const data = await this.call(`https://api.weixin.qq.com/sns/oauth2/refresh_token?appid=${encodeURIComponent(this.config.clientKey)}&grant_type=refresh_token&refresh_token=${encodeURIComponent(this.refreshTokenValue)}`);
        this.accessToken = data.access_token;
        this.refreshTokenValue = data.refresh_token;
        this.tokenExpire = Date.now() + data.expires_in * 1000;
        return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt: new Date(this.tokenExpire) };
    }
    async getToken() {
        const injected = this.getInjectedAccessToken();
        if (injected)
            return injected;
        if (this.accessToken && Date.now() < this.tokenExpire - 60000)
            return this.accessToken;
        if (this.refreshTokenValue)
            return (await this.refreshToken()).accessToken;
        throw new Error('WeChat Video adapter is not authenticated');
    }
    async uploadVideo(mediaUrl) {
        const token = await this.getToken();
        const bytes = await this.fetchMediaBytes(mediaUrl);
        const form = new FormData();
        form.append('media', new Blob([bytes], { type: 'video/mp4' }), 'video.mp4');
        const data = await this.callMultipart(`https://api.weixin.qq.com/channels/ec/basics/video/upload?access_token=${encodeURIComponent(token)}`, form);
        return data.media_id;
    }
    async publish(post) {
        const token = await this.getToken();
        let mediaId = '';
        if (post.mediaUrls?.length) {
            mediaId = await this.uploadVideo(post.mediaUrls[0]);
        }
        const data = await this.call(`https://api.weixin.qq.com/channels/ec/publish/submit?access_token=${encodeURIComponent(token)}`, { method: 'POST', body: JSON.stringify({ title: post.content, media_id: mediaId }) });
        return {
            externalId: data.publish_id,
            externalUrl: `https://channels.weixin.qq.com/#/publish/${data.publish_id}`,
            publishedAt: new Date(),
        };
    }
    async fetchMetrics(accountId, dateRange) {
        const token = await this.getToken();
        const data = await this.call(`https://api.weixin.qq.com/channels/ec/basics/getaccessinfo?access_token=${encodeURIComponent(token)}`);
        return {
            impressions: data.play_cnt ?? 0,
            engagements: data.like_cnt ?? 0,
            likes: data.like_cnt ?? 0,
            comments: data.comment_cnt ?? 0,
            shares: data.share_cnt ?? 0,
            views: data.play_cnt ?? 0,
            followerCount: data.fans_cnt ?? 0,
        };
    }
    async fetchComments(accountId, postId) {
        const token = await this.getToken();
        const data = await this.call(`https://api.weixin.qq.com/channels/ec/comment/list?access_token=${encodeURIComponent(token)}&item_id=${encodeURIComponent(postId)}`);
        return (data.comments ?? []).map((c) => ({
            id: c.comment_id,
            authorId: c.nickname,
            authorName: c.nickname,
            content: c.content,
            createdAt: new Date(c.create_time * 1000),
        }));
    }
}
exports.WechatVideoAdapter = WechatVideoAdapter;
//# sourceMappingURL=wechat-video.js.map