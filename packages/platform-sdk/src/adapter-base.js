"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseAdapter = void 0;
const oauth_callback_1 = require("./oauth-callback");
class BaseAdapter {
    constructor() {
        this.injectedToken = null;
        this.injectedRefreshToken = null;
        this.injectedTokenExpire = 0;
    }
    setCredentials(creds) {
        this.injectedToken = creds.accessToken ?? null;
        this.injectedRefreshToken = creds.refreshToken ?? null;
        const exp = creds.expiresAt;
        if (exp instanceof Date) {
            this.injectedTokenExpire = exp.getTime();
        }
        else if (typeof exp === 'number') {
            this.injectedTokenExpire = exp;
        }
        else if (typeof exp === 'string' && exp) {
            this.injectedTokenExpire = new Date(exp).getTime() || Date.now() + 3600_000;
        }
        else {
            this.injectedTokenExpire = Date.now() + 3600_000;
        }
    }
    callbackFor(platform = this.platform) {
        return (0, oauth_callback_1.callbackUrlFor)(platform);
    }
    hasInjectedToken() {
        return !!this.injectedToken && Date.now() < this.injectedTokenExpire - 60000;
    }
    getInjectedAccessToken() {
        return this.hasInjectedToken() ? this.injectedToken : null;
    }
    getInjectedRefreshToken() {
        return this.injectedRefreshToken;
    }
    async call(url, init = {}) {
        const headers = {};
        const src = init.headers;
        if (src instanceof Headers) {
            src.forEach((v, k) => { headers[k] = v; });
        }
        else if (Array.isArray(src)) {
            for (const [k, v] of src)
                headers[k] = v;
        }
        else if (src) {
            Object.assign(headers, src);
        }
        if (!headers['Content-Type'] && !headers['content-type']) {
            headers['Content-Type'] = 'application/json';
        }
        const res = await fetch(url, { ...init, headers });
        if (!res.ok) {
            throw new Error(`${this.platform} request failed: HTTP ${res.status}`);
        }
        return (await res.json());
    }
    async callMultipart(url, formData, extraHeaders) {
        const res = await fetch(url, {
            method: 'POST',
            headers: extraHeaders ?? {},
            body: formData,
        });
        if (!res.ok) {
            throw new Error(`${this.platform} multipart upload failed: HTTP ${res.status}`);
        }
        return (await res.json());
    }
    async fetchMediaBytes(mediaUrl) {
        const res = await fetch(mediaUrl);
        if (!res.ok) {
            throw new Error(`Failed to fetch media from ${mediaUrl}: HTTP ${res.status}`);
        }
        return res.arrayBuffer();
    }
    async refreshToken() {
        throw new Error(`${this.platform} does not support token refresh`);
    }
    async fetchComments(accountId, postId) {
        throw new Error(`${this.platform} does not expose a comments API`);
    }
    async replyToComment(_accountId, _commentId, _content) {
        throw new Error(`${this.platform} does not support comment replies`);
    }
    async fetchMessages(_accountId) {
        throw new Error(`${this.platform} does not expose a messages API`);
    }
    async replyToMessage(_accountId, _messageId, _content) {
        throw new Error(`${this.platform} does not support replying to private messages`);
    }
}
exports.BaseAdapter = BaseAdapter;
//# sourceMappingURL=adapter-base.js.map