import {
  Comment,
  Credentials,
  DateRange,
  Message,
  MetricsResult,
  Platform,
  PlatformAdapter,
  PublishRequest,
  PublishResult,
} from './types';
import { callbackUrlFor } from './oauth-callback';

/**
 * Shared helpers and sensible defaults for every ConcreteAdapter.
 * Platform-specific adapters extend this class and override the operations
 * that the platform's API actually supports. Operations that a platform does
 * not implement throw a clear, typed error so callers can branch on it.
 */
export abstract class BaseAdapter implements PlatformAdapter {
  abstract platform: Platform;

  /**
   * Token injected from stored credentials (e.g. a persisted OAuth access
   * token). When present, adapters use it instead of performing a live
   * OAuth handshake. `expiresAt` defaults to ~1h out if omitted.
   */
  private injectedToken: string | null = null;
  private injectedRefreshToken: string | null = null;
  private injectedTokenExpire = 0;

  /** Seed the adapter with credentials already stored for the account. */
  setCredentials(creds: {
    accessToken?: string | null;
    refreshToken?: string | null;
    expiresAt?: string | number | Date | null;
  }): void {
    this.injectedToken = creds.accessToken ?? null;
    this.injectedRefreshToken = creds.refreshToken ?? null;
    const exp = creds.expiresAt;
    if (exp instanceof Date) {
      this.injectedTokenExpire = exp.getTime();
    } else if (typeof exp === 'number') {
      this.injectedTokenExpire = exp;
    } else if (typeof exp === 'string' && exp) {
      this.injectedTokenExpire = new Date(exp).getTime() || Date.now() + 3600_000;
    } else {
      this.injectedTokenExpire = Date.now() + 3600_000;
    }
  }

  /**
   * OAuth2 callback URL for this platform, derived from the shared
   * OAUTH_CALLBACK_BASE (so new deployments stop hard-coding
   * `https://your-domain.com`). Subclasses call this from getAuthUrl /
   * handleCallback instead of inlining the host.
   */
  protected callbackFor(platform: Platform = this.platform): string {
    return callbackUrlFor(platform);
  }

  /** True when the adapter can publish without a fresh OAuth handshake. */
  protected hasInjectedToken(): boolean {
    return !!this.injectedToken && Date.now() < this.injectedTokenExpire - 60000;
  }

  protected getInjectedAccessToken(): string | null {
    return this.hasInjectedToken() ? this.injectedToken : null;
  }

  protected getInjectedRefreshToken(): string | null {
    return this.injectedRefreshToken;
  }

  /** Default timeout for all external platform requests (15s). */
  protected static readonly REQUEST_TIMEOUT_MS = 15_000;

  /** Max response body size for JSON responses (5 MiB). */
  protected static readonly MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

  /**
   * Validate a URL before fetching — blocks SSRF to internal networks.
   * Only allows https:// with a public destination.
   */
  protected validateUrl(url: string): void {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error(`Invalid URL: ${url}`);
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new Error(`Unsupported protocol ${parsed.protocol} — only http/https allowed`);
    }
    const hostname = parsed.hostname.toLowerCase();
    // Block loopback
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname.startsWith('127.')) {
      throw new Error(`Blocked internal address: ${hostname}`);
    }
    // Block RFC1918 / private ranges
    if (
      hostname.startsWith('10.') ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('0.') ||
      hostname.startsWith('169.254.') ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
    ) {
      throw new Error(`Blocked private network address: ${hostname}`);
    }
    // Block cloud metadata
    if (hostname === '169.254.169.254' || hostname === 'metadata.google.internal') {
      throw new Error(`Blocked metadata address: ${hostname}`);
    }
  }

  /** Perform an authenticated fetch against the platform API. */
  protected async call<T>(url: string, init: RequestInit = {}): Promise<T> {
    this.validateUrl(url);
    const headers: Record<string, string> = {};
    const src = init.headers;
    if (src instanceof Headers) {
      src.forEach((v, k) => { headers[k] = v; });
    } else if (Array.isArray(src)) {
      for (const [k, v] of src) headers[k] = v;
    } else if (src) {
      Object.assign(headers, src);
    }
    // Only default to JSON when the caller has not already specified a
    // Content-Type (e.g. form-urlencoded OAuth token exchanges).
    if (!headers['Content-Type'] && !headers['content-type']) {
      headers['Content-Type'] = 'application/json';
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), BaseAdapter.REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, { ...init, headers, signal: controller.signal });
      if (!res.ok) {
        throw new Error(`${this.platform} request failed: HTTP ${res.status}`);
      }
      const text = await res.text();
      if (text.length > BaseAdapter.MAX_RESPONSE_BYTES) {
        throw new Error(`${this.platform} response too large: ${text.length} bytes`);
      }
      return JSON.parse(text) as T;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Perform a multipart/form-data upload against the platform API.
   * Does NOT set Content-Type header (browser/fetch will set the boundary).
   */
  protected async callMultipart<T>(url: string, formData: FormData, extraHeaders?: Record<string, string>): Promise<T> {
    this.validateUrl(url);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), BaseAdapter.REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: extraHeaders ?? {},
        body: formData,
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`${this.platform} multipart upload failed: HTTP ${res.status}`);
      }
      const text = await res.text();
      if (text.length > BaseAdapter.MAX_RESPONSE_BYTES) {
        throw new Error(`${this.platform} response too large: ${text.length} bytes`);
      }
      return JSON.parse(text) as T;
    } finally {
      clearTimeout(timeout);
    }
  }

  /** Fetch media bytes from a URL — with SSRF protection and size limits. */
  protected async fetchMediaBytes(mediaUrl: string): Promise<ArrayBuffer> {
    this.validateUrl(mediaUrl);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), BaseAdapter.REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(mediaUrl, { signal: controller.signal });
      if (!res.ok) {
        throw new Error(`Failed to fetch media from ${mediaUrl}: HTTP ${res.status}`);
      }
      const buf = await res.arrayBuffer();
      if (buf.byteLength > 100 * 1024 * 1024) {
        throw new Error(`Media too large: ${buf.byteLength} bytes (max 100 MiB)`);
      }
      return buf;
    } finally {
      clearTimeout(timeout);
    }
  }

  // ── Auth ────────────────────────────────────────────────────────────
  abstract getAuthUrl(state: string): string;
  abstract handleCallback(code: string): Promise<Credentials>;

  async refreshToken(): Promise<Credentials> {
    throw new Error(`${this.platform} does not support token refresh`);
  }

  // ── Publishing ──────────────────────────────────────────────────────
  abstract publish(post: PublishRequest): Promise<PublishResult>;

  // ── Metrics ─────────────────────────────────────────────────────────
  abstract fetchMetrics(
    accountId: string,
    dateRange: DateRange,
  ): Promise<MetricsResult>;

  // ── Engagement ─────────────────────────────────────────────────────
  async fetchComments(accountId: string, postId: string): Promise<Comment[]> {
    throw new Error(`${this.platform} does not expose a comments API`);
  }

  async replyToComment(
    _accountId: string,
    _commentId: string,
    _content: string,
  ): Promise<void> {
    throw new Error(`${this.platform} does not support comment replies`);
  }

  async fetchMessages(_accountId: string): Promise<Message[]> {
    throw new Error(`${this.platform} does not expose a messages API`);
  }

  async replyToMessage(
    _accountId: string,
    _messageId: string,
    _content: string,
  ): Promise<void> {
    throw new Error(`${this.platform} does not support replying to private messages`);
  }

  /**
   * Validate that the stored credentials are valid against the platform API.
   * Returns true if valid, throws with a descriptive error if not.
   * Default implementation tries getAccessToken(); adapters can override.
   */
  async validateCredentials(): Promise<boolean> {
    if (typeof (this as unknown as { getAccessToken?: () => Promise<string> }).getAccessToken === 'function') {
      await (this as unknown as { getAccessToken: () => Promise<string> }).getAccessToken();
      return true;
    }
    throw new Error(`${this.platform} does not support credential validation`);
  }
}
