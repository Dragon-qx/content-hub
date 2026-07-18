export declare const OAUTH_CALLBACK_BASE: string;
/** Build the full callback URL for a platform (OAuth2 `redirect_uri`). */
export declare function callbackUrlFor(platform: string): string;
/** Convenience: URL-encoded `redirect_uri` value ready to drop into a query. */
export declare function encodedCallbackFor(platform: string): string;
