import {
  Comment,
  Credentials,
  DateRange,
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
}
