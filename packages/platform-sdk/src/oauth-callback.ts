/**
 * OAuth2 callback URL resolver, env-configurable.
 *
 * Per-platform adapters hard-coded `https://your-domain.com/callback/{platform}`
 * for too long; set OAUTH_CALLBACK_BASE to the public base of your ContentHub
 * deployment (no trailing slash) to override it everywhere. Each adapter then
 * builds `${OAUTH_CALLBACK_BASE}/callback/${platform}` — matching the route
 * the OAuthCallbackController mounts.
 *
 *   OAUTH_CALLBACK_BASE=https://app.example.com →
 *     https://app.example.com/callback/douyin
 *     https://app.example.com/callback/wechat-official …
 *
 * When unset, the legacy `https://your-domain.com` default is used so existing
 * environments keep working until they opt in.
 */
declare const process: { env: Record<string, string | undefined> };

export const OAUTH_CALLBACK_BASE =
  process.env.OAUTH_CALLBACK_BASE?.replace(/\/+$/, '') ??
  'https://your-domain.com';

/** Build the full callback URL for a platform (OAuth2 `redirect_uri`). */
export function callbackUrlFor(platform: string): string {
  return `${OAUTH_CALLBACK_BASE}/callback/${platform.toLowerCase()}`;
}

/** Convenience: URL-encoded `redirect_uri` value ready to drop into a query. */
export function encodedCallbackFor(platform: string): string {
  return encodeURIComponent(callbackUrlFor(platform));
}
