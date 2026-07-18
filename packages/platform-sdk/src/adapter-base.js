"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseAdapter = void 0;
const oauth_callback_1 = require("./oauth-callback");
/**
 * Shared helpers and sensible defaults for every ConcreteAdapter.
 * Platform-specific adapters extend this class and override the operations
 * that the platform's API actually supports. Operations that a platform does
 * not implement throw a clear, typed error so callers can branch on it.
 */
class BaseAdapter {
    constructor() {
        /**
         * Token injected from stored credentials (e.g. a persisted OAuth access
         * token). When present, adapters use it instead of performing a live
         * OAuth handshake. `expiresAt` defaults to ~1h out if omitted.
         */
        this.injectedToken = null;
        this.injectedRefreshToken = null;
        this.injectedTokenExpire = 0;
    }
    /** Seed the adapter with credentials already stored for the account. */
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
    /**
     * OAuth2 callback URL for this platform, derived from the shared
     * OAUTH_CALLBACK_BASE (so new deployments stop hard-coding
     * `https://your-domain.com`). Subclasses call this from getAuthUrl /
     * handleCallback instead of inlining the host.
     */
    callbackFor(platform = this.platform) {
        return (0, oauth_callback_1.callbackUrlFor)(platform);
    }
    /** True when the adapter can publish without a fresh OAuth handshake. */
    hasInjectedToken() {
        return !!this.injectedToken && Date.now() < this.injectedTokenExpire - 60000;
    }
    getInjectedAccessToken() {
        return this.hasInjectedToken() ? this.injectedToken : null;
    }
    getInjectedRefreshToken() {
        return this.injectedRefreshToken;
    }
    /** Perform an authenticated fetch against the platform API. */
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
        // Only default to JSON when the caller has not already specified a
        // Content-Type (e.g. form-urlencoded OAuth token exchanges).
        if (!headers['Content-Type'] && !headers['content-type']) {
            headers['Content-Type'] = 'application/json';
        }
        const res = await fetch(url, { ...init, headers });
        if (!res.ok) {
            throw new Error(`${this.platform} request failed: HTTP ${res.status}`);
        }
        return (await res.json());
    }
    /**
     * Perform a multipart/form-data upload against the platform API.
     * Does NOT set Content-Type header (browser/fetch will set the boundary).
     */
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
    /** Fetch media bytes from a URL (HTTP/HTTPS) or local path. */
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
    // ── Engagement ─────────────────────────────────────────────────────
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