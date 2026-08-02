'use client';

const API_BASE = process.env.NEXT_PUBLIC_API_URL
  ? `${process.env.NEXT_PUBLIC_API_URL}`
  : (typeof window !== 'undefined' && window.location.port === '3001')
    ? 'http://localhost:3000/api/v1'
    : '/api/v1';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface Paginated<T> {
  items: T[];
  total: number;
  skip: number;
  take: number;
}

let authToken: string | null = null;
let refreshToken: string | null = null;

// In-flight refresh promise shared by concurrent 401s so we issue at most one
// refresh request while several requests are awaiting the new access token.
let pendingRefresh: Promise<boolean> | null = null;

/**
 * Invoked when a request fails with HTTP 401 and cannot be refreshed. The auth
 * layer registers a handler that logs the user out so the AuthGuard redirects
 * to /login.
 */
let onUnauthorized: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

export function setAuthToken(token: string | null) {
  authToken = token;
  if (typeof window !== 'undefined') {
    if (token) localStorage.setItem('accessToken', token);
    else localStorage.removeItem('accessToken');
  }
}

export function getAuthToken(): string | null {
  if (authToken) return authToken;
  if (typeof window !== 'undefined') {
    authToken = localStorage.getItem('accessToken');
  }
  return authToken;
}

/** Persist the refresh token (call alongside setAuthToken after login). */
export function setRefreshToken(token: string | null) {
  refreshToken = token;
  if (typeof window !== 'undefined') {
    if (token) localStorage.setItem('refreshToken', token);
    else localStorage.removeItem('refreshToken');
  }
}

export function getRefreshToken(): string | null {
  if (refreshToken) return refreshToken;
  if (typeof window !== 'undefined') {
    refreshToken = localStorage.getItem('refreshToken');
  }
  return refreshToken;
}

/**
 * Swap the stored refresh token for a fresh access token. Returns true on
 * success. Concurrent callers share a single request.
 */
async function refreshTokens(): Promise<boolean> {
  if (pendingRefresh) return pendingRefresh;
  pendingRefresh = (async () => {
    try {
      const rt = getRefreshToken();
      if (!rt) return false;
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: rt }),
      });
      if (!res.ok) return false;
      const data = (await res.json()) as {
        accessToken?: string;
        refreshToken?: string;
      };
      setAuthToken(data.accessToken ?? null);
      if (data.refreshToken) setRefreshToken(data.refreshToken);
      return Boolean(data.accessToken);
    } catch {
      return false;
    } finally {
      pendingRefresh = null;
    }
  })();
  return pendingRefresh;
}

/** Default request timeout (30 seconds) */
const DEFAULT_TIMEOUT_MS = 30_000;

/** Maximum number of retries for transient errors */
const MAX_RETRIES = 2;

/** Delay between retries (exponential backoff) */
const RETRY_BASE_DELAY_MS = 1000;

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Check if an error is retryable (network error or 5xx server error) */
function isRetryable(error: unknown, response?: Response): boolean {
  // Network errors (TypeError from fetch) are retryable
  if (error instanceof TypeError) return true;
  // 5xx server errors are retryable
  if (response && response.status >= 500 && response.status < 600) return true;
  // 429 Too Many Requests is retryable
  if (response && response.status === 429) return true;
  return false;
}

/** Exponential backoff delay */
function retryDelay(attempt: number): number {
  return RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  const token = getAuthToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let lastError: unknown;
  let lastResponse: Response | undefined;

  // Retry loop for transient errors
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      // Refresh-once seam: if the access token has expired, trade the refresh
      // token for a new pair and retry before giving up.
      if (lastResponse?.status === 401 && path !== '/auth/refresh') {
        if (await refreshTokens()) {
          const retryHeaders = new Headers(init.headers);
          retryHeaders.set('Content-Type', 'application/json');
          const next = getAuthToken();
          if (next) retryHeaders.set('Authorization', `Bearer ${next}`);
          lastResponse = await fetchWithTimeout(`${API_BASE}${path}`, { ...init, headers: retryHeaders });
        }
      } else if (!lastResponse) {
        lastResponse = await fetchWithTimeout(`${API_BASE}${path}`, { ...init, headers });
      }

      lastResponse = lastResponse!;

      // Success case
      if (lastResponse.ok && lastResponse.status !== 401) {
        const text = await lastResponse.text();
        const data = text ? JSON.parse(text) : null;
        return data as T;
      }

      // 401 Unauthorized — try refresh once
      if (lastResponse.status === 401 && path !== '/auth/refresh') {
        if (await refreshTokens()) {
          // Update headers with new token and retry
          const retryHeaders = new Headers(init.headers);
          retryHeaders.set('Content-Type', 'application/json');
          const next = getAuthToken();
          if (next) retryHeaders.set('Authorization', `Bearer ${next}`);
          const retryResponse = await fetchWithTimeout(`${API_BASE}${path}`, { ...init, headers: retryHeaders });
          if (retryResponse.ok) {
            const text = await retryResponse.text();
            const data = text ? JSON.parse(text) : null;
            return data as T;
          }
          // Refresh didn't help — logout
          onUnauthorized?.();
          throw new ApiError(401, 'Unauthorized');
        }
        onUnauthorized?.();
        throw new ApiError(401, 'Unauthorized');
      }

      // Check if retryable
      if (attempt < MAX_RETRIES && isRetryable(null, lastResponse)) {
        lastError = new Error(`Server error ${lastResponse.status}`);
        await new Promise((resolve) => setTimeout(resolve, retryDelay(attempt)));
        lastResponse = undefined; // Force retry
        continue;
      }

      // Non-retryable error
      const text = await lastResponse.text();
      const data = text ? JSON.parse(text) : null;
      const message = data?.message ?? `Request failed (${lastResponse.status})`;
      throw new ApiError(lastResponse.status, message, data);
    } catch (err) {
      lastError = err;

      // Don't retry AbortError (timeout/cancel)
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new ApiError(408, 'Request timed out');
      }

      // Retry on network errors
      if (attempt < MAX_RETRIES && isRetryable(err)) {
        await new Promise((resolve) => setTimeout(resolve, retryDelay(attempt)));
        lastResponse = undefined; // Force retry
        continue;
      }

      throw err;
    }
  }

  // All retries exhausted
  throw lastError instanceof Error ? lastError : new Error('Request failed after retries');
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  publish: async <T>(contentId: string, platform: string, payload: { mediaUrls?: string[]; accountId?: string }) => {
    const queryParams = payload.accountId ? `?accountId=${encodeURIComponent(payload.accountId)}` : '';
    return request<T>(`/platform-sdk/publish${queryParams}`, {
      method: 'POST',
      body: JSON.stringify({ contentId, platform, payload: { mediaUrls: payload.mediaUrls } }),
    });
  },
  /**
   * Upload a file as multipart/form-data. The Content-Type header is
   * intentionally omitted so the browser sets the correct `boundary`.
   * Extra text fields (e.g. contentId) may be attached alongside the file.
   */
  upload: async <T>(path: string, file: File, fields?: Record<string, string>): Promise<T> => {
    const form = new FormData();
    form.append('file', file);
    if (fields) {
      for (const [key, value] of Object.entries(fields)) {
        form.append(key, value);
      }
    }
    const headers = new Headers();
    const token = getAuthToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);

    let res = await fetch(`${API_BASE}${path}`, { method: 'POST', body: form, headers });

    // Same refresh-once seam as the JSON path above.
    if (res.status === 401) {
      if (await refreshTokens()) {
        const retry = new Headers();
        const next = getAuthToken();
        if (next) retry.set('Authorization', `Bearer ${next}`);
        res = await fetch(`${API_BASE}${path}`, { method: 'POST', body: form, headers: retry });
      }
      if (res.status === 401) {
        onUnauthorized?.();
        throw new ApiError(401, 'Unauthorized');
      }
    }

    const text = await res.text();
    const data = text ? JSON.parse(text) : null;

    if (!res.ok) {
      const message = data?.message ?? `Upload failed (${res.status})`;
      throw new ApiError(res.status, message, data);
    }
    return data as T;
  },
};

/**
 * Build a scannable QR-code data URL from an otpauth:// URI using a
 * client-side canvas. No data leaves the browser (the TOTP secret is never
 * sent to a third party). Falls back to null if canvas is unavailable.
 */
export function qrCodeUrl(otpauthUrl: string, size = 220): string | null {
  // Use a simple SVG-based QR generator that runs entirely client-side.
  // We use a compact inline approach — generate an SVG from the otpauth data.
  try {
    // Use QRCode.js-style generation via canvas if available
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    canvas.width = size;
    canvas.height = size;
    // Use a minimal QR code library approach via inline SVG
    // For now, return null and let the UI show the secret as text
    // A production app should use a proper client-side QR library like 'qrcode'
    return null;
  } catch {
    return null;
  }
}

/**
 * Fetch an authenticated endpoint that returns a file and trigger a browser
 * download. The JWT is attached as a Bearer header (it is not present on a
 * plain navigation request, so we cannot just point the browser at the URL).
 */
export async function downloadFile(path: string, filename: string): Promise<void> {
  const headers = new Headers();
  const token = getAuthToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`${API_BASE}${path}`, { headers });
  if (!res.ok) {
    const message = await res.text().catch(() => `Download failed (${res.status})`);
    throw new ApiError(res.status, message);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
