"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OAUTH_CALLBACK_BASE = void 0;
exports.callbackUrlFor = callbackUrlFor;
exports.encodedCallbackFor = encodedCallbackFor;
exports.OAUTH_CALLBACK_BASE = process.env.OAUTH_CALLBACK_BASE?.replace(/\/+$/, '') ??
    'https://your-domain.com';
/** Build the full callback URL for a platform (OAuth2 `redirect_uri`). */
function callbackUrlFor(platform) {
    return `${exports.OAUTH_CALLBACK_BASE}/callback/${platform.toLowerCase()}`;
}
/** Convenience: URL-encoded `redirect_uri` value ready to drop into a query. */
function encodedCallbackFor(platform) {
    return encodeURIComponent(callbackUrlFor(platform));
}
//# sourceMappingURL=oauth-callback.js.map