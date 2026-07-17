'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
  useCallback,
} from 'react';
import {
  api,
  getAuthToken,
  setAuthToken,
  setUnauthorizedHandler,
} from './api';
import { AuthUser } from './types';

export interface LoginResult {
  /** When true, the password was accepted but a TOTP code is now required. */
  mfaRequired?: boolean;
  mfaToken?: string;
  accessToken?: string;
}

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  /**
   * Complete an MFA-protected login with the token issued by `login` plus a
   * TOTP code. On success the session is established as usual.
   */
  mfaLogin: (mfaToken: string, code: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const hydrate = useCallback(async () => {
    if (!getAuthToken()) {
      setLoading(false);
      return;
    }
    try {
      const me = await api.get<AuthUser>('/users/me');
      setUser(me);
    } catch {
      setAuthToken(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // When an API call fails with 401 (expired/invalid token), clear the session.
  // Setting user to null triggers the AuthGuard to redirect to /login.
  useEffect(() => {
    setUnauthorizedHandler(() => logout());
    return () => setUnauthorizedHandler(null);
  }, []);

  const login = async (email: string, password: string): Promise<LoginResult> => {
    const res = await api.post<LoginResult>('/auth/login', { email, password });
    if (res.mfaRequired && res.mfaToken) {
      // Keep the mfaToken for the second step; no session yet.
      return { mfaRequired: true, mfaToken: res.mfaToken };
    }
    setAuthToken(res.accessToken ?? null);
    await hydrate();
    return {};
  };

  const mfaLogin = async (mfaToken: string, code: string) => {
    const res = await api.post<{ accessToken: string }>('/auth/mfa/login', {
      mfaToken,
      code,
    });
    setAuthToken(res.accessToken);
    await hydrate();
  };

  const register = async (email: string, password: string, name: string) => {
    const res = await api.post<{ accessToken: string }>('/auth/register', {
      email,
      password,
      name,
    });
    setAuthToken(res.accessToken);
    await hydrate();
  };

  const logout = () => {
    setAuthToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, mfaLogin, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
