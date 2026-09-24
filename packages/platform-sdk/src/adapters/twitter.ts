import { createHash, randomBytes } from 'node:crypto';
import { BaseAdapter } from '../adapter-base';
import {
  Credentials,
  DateRange,
  MetricsResult,
  Platform,
  PublishRequest,
  PublishResult,
} from '../types';

export interface TwitterConfig {
  clientKey: string;
  clientSecret: string;
  /** OAuth2 user id (author_id) resolved at code exchange. */
  userId?: string;
}

/**
 * X (Twitter) adapter — OAuth2 Authorization Code + PKCE + X API v2.
 * See: https://developer.twitter.com/en/docs/twitter-api
 *
 * Capabilities: auth, publish, and account-level metrics. X's v2 free tier does
 * not expose an impressions/engagement endpoint, so those counters are left at
 * 0. Comments (quote tweets / replies threading) and DMs are not surfaced — the
 * BaseAdapter defaults throw a clear "not supported" error the engagement
 * layer branches on.
 */

/**
 * Per-state PKCE verifiers. `getAuthUrl` mints a random verifier and stores it
 * keyed by the OAuth `state`; `handleCallback` retrieves it to complete the
 * code exchange. Entries are pruned after PKCE_TTL_MS so abandoned flows don't
 * leak memory. The verifier never leaves the server — only its S256 challenge
 * is sent to the authorize endpoint.
 */
const verifierByState = new Map<string, { verifier: string; createdAt: number }>();
const PKCE_TTL_MS = 10 * 60 * 1000; // matches the sealed state token TTL

/** base64url(SHA-256(verifier)) — the PKCE S256 challenge. */
function s256Challenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

function storeVerifier(state: string, verifier: string): void {
  // Opportunistic prune of expired entries before inserting.
  const now = Date.now();
  for (const [key, entry] of verifierByState) {
    if (now - entry.createdAt > PKCE_TTL_MS) verifierByState.delete(key);
  }
  verifierByState.set(state, { verifier, createdAt: now });
}

function takeVerifier(state: string): string {
  const entry = state ? verifierByState.get(state) : undefined;
  if (!entry) {
    throw new Error(
      'No PKCE verifier found for this OAuth state — start a fresh authorize flow',
    );
  }
  verifierByState.delete(state);
  return entry.verifier;
}

export class TwitterAdapter extends BaseAdapter {
  platform = Platform.TWITTER;
  private accessToken: string | null = null;
  private tokenExpire = 0;
  private refreshTokenValue: string | null = null;
  private userId: string;

  constructor(private config: TwitterConfig) {
    super();
    this.userId = config.userId ?? '';
  }

  getAuthUrl(state: string): string {
    const redirect = encodeURIComponent(this.callbackFor());
    const verifier = randomBytes(64).toString('base64url');
    storeVerifier(state, verifier);
    const challenge = s256Challenge(verifier);
    return `https://twitter.com/i/oauth2/authorize?response_type=code&client_id=${encodeURIComponent(
      this.config.clientKey,
    )}&redirect_uri=${redirect}&scope=tweet.read%20tweet.write%20users.read%20offline.access&state=${encodeURIComponent(
      state,
    )}&code_challenge=${challenge}&code_challenge_method=S256`;
  }

  async handleCallback(code: string, state?: string): Promise<Credentials> {
    const verifier = takeVerifier(state ?? '');
    const data = await this.call<{ access_token: string; refresh_token?: string; expires_in: number }>(
      'https://api.twitter.com/2/oauth2/token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          ...basicAuth(this.config.clientKey, this.config.clientSecret),
        },
        body: new URLSearchParams({
          code,
          grant_type: 'authorization_code',
          redirect_uri: this.callbackFor(),
          code_verifier: verifier,
        }).toString(),
      },
    );
    this.accessToken = data.access_token;
    this.refreshTokenValue = data.refresh_token ?? null;
    this.tokenExpire = Date.now() + data.expires_in * 1000;
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(this.tokenExpire),
    };
  }

  async refreshToken(): Promise<Credentials> {
    if (!this.refreshTokenValue) throw new Error('No refresh token for Twitter');
    const data = await this.call<{ access_token: string; refresh_token?: string; expires_in: number }>(
      'https://api.twitter.com/2/oauth2/token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          ...basicAuth(this.config.clientKey, this.config.clientSecret),
        },
        body: new URLSearchParams({
          refresh_token: this.refreshTokenValue,
          grant_type: 'refresh_token',
        }).toString(),
      },
    );
    this.accessToken = data.access_token;
    this.refreshTokenValue = data.refresh_token ?? this.refreshTokenValue;
    this.tokenExpire = Date.now() + data.expires_in * 1000;
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(this.tokenExpire),
    };
  }

  private async getToken(): Promise<string> {
    const injected = this.getInjectedAccessToken();
    if (injected) return injected;
    if (this.accessToken && Date.now() < this.tokenExpire - 60000) return this.accessToken;
    if (this.refreshTokenValue) return (await this.refreshToken()).accessToken;
    throw new Error('Twitter adapter is not authenticated');
  }

  async publish(post: PublishRequest): Promise<PublishResult> {
    const token = await this.getToken();
    const data = await this.call<{ data: { id: string; text: string } }>(
      'https://api.twitter.com/2/tweets',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ text: post.content }),
      },
    );
    return {
      externalId: data.data.id,
      externalUrl: `https://twitter.com/${this.userId}/status/${data.data.id}`,
      publishedAt: new Date(),
    };
  }

  async fetchMetrics(accountId: string, dateRange: DateRange): Promise<MetricsResult> {
    const token = await this.getToken();
    const data = await this.call<{
      data?: { public_metrics?: Record<string, number>; id: string };
    }>(
      `https://api.twitter.com/2/users/${encodeURIComponent(
        this.userId || accountId,
      )}?user.fields=public_metrics`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const pm = data.data?.public_metrics ?? {};
    return {
      impressions: 0,
      engagements: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      views: 0,
      followerCount: pm.followers_count ?? 0,
    };
  }
}

/** Build the HTTP Basic auth header for an OAuth2 client credentials pair. */
function basicAuth(key: string, secret: string): Record<string, string> {
  return { Authorization: `Basic ${globalThis.btoa(`${key}:${secret}`)}` };
}
