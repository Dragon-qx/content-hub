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

/**
 * Invoked when a request fails with HTTP 401. The auth layer registers a
 * handler that logs the user out so the AuthGuard redirects to /login.
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

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  const token = getAuthToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });

  if (res.status === 401) {
    // The auth layer reacts via setUnauthorizedHandler (logout + redirect).
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
