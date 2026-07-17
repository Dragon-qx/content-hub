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

  /** Perform an authenticated fetch against the platform API. */
  protected async call<T>(url: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(url, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    });
    if (!res.ok) {
      throw new Error(`${this.platform} request failed: HTTP ${res.status}`);
    }
    return (await res.json()) as T;
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
}
