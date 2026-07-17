'use client';

const API_BASE = '/api/v1';

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

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  const token = getAuthToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let res = await fetch(`${API_BASE}${path}`, { ...init, headers });

  // Refresh-once seam: if the access token has expired, trade the refresh
  // token for a new pair and retry before giving up. Skipped for the refresh
  // endpoint itself to avoid an infinite loop.
  if (res.status === 401 && path !== '/auth/refresh') {
    if (await refreshTokens()) {
      const retry = new Headers(init.headers);
      retry.set('Content-Type', 'application/json');
      const next = getAuthToken();
      if (next) retry.set('Authorization', `Bearer ${next}`);
      res = await fetch(`${API_BASE}${path}`, { ...init, headers: retry });
    }
  }

  if (res.status === 401) {
    // (Possibly after a failed refresh.) Log out + redirect.
    onUnauthorized?.();
    throw new ApiError(401, 'Unauthorized');
  }

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const message = data?.message ?? `Request failed (${res.status})`;
    throw new ApiError(res.status, message, data);
  }
  return data as T;
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
 * Build a scannable QR-code image URL from an otpauth:// URI using the
 * free QuickChart API, so setup needs no client-side QR dependency. Falls
 * back to null (caller shows the secret inline) if the browser is offline.
 */
export function qrCodeUrl(otpauthUrl: string, size = 220): string {
  const encoded = encodeURIComponent(otpauthUrl);
  return `https://quickchart.io/qr?text=${encoded}&size=${size}&margin=1`;
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
