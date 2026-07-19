"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OAUTH_CALLBACK_BASE = void 0;
exports.callbackUrlFor = callbackUrlFor;
exports.encodedCallbackFor = encodedCallbackFor;
exports.OAUTH_CALLBACK_BASE = process.env.OAUTH_CALLBACK_BASE?.replace(/\/+$/, '') ??
    'https://your-domain.com';
function callbackUrlFor(platform) {
    return `${exports.OAUTH_CALLBACK_BASE}/callback/${platform.toLowerCase()}`;
}
function encodedCallbackFor(platform) {
    return encodeURIComponent(callbackUrlFor(platform));
}
//# sourceMappingURL=oauth-callback.js.map