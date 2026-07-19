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
  setRefreshToken,
  setUnauthorizedHandler,
} from './api';
import { AuthTeam, AuthUser } from './types';

export interface LoginResult {
  /** When true, the password was accepted but a TOTP code is now required. */
  mfaRequired?: boolean;
  mfaToken?: string;
  accessToken?: string;
}

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  teams: AuthTeam[];
  activeTeamId: string;
  setActiveTeamId: (id: string) => void;
  refreshTeams: () => Promise<void>;
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

const ACTIVE_TEAM_KEY = 'content-hub.activeTeamId';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [teams, setTeams] = useState<AuthTeam[]>([]);
  const [activeTeamId, _setActiveTeamId] = useState('');
  const [loading, setLoading] = useState(true);

  const setActiveTeamId = useCallback((id: string) => {
    _setActiveTeamId(id);
    if (typeof window !== 'undefined') {
      localStorage.setItem(ACTIVE_TEAM_KEY, id);
    }
  }, []);

  // Fetch the teams the current user belongs to (from the Member join table).
  // We always derive the active team from this live list rather than trusting
  // a single teamId column, because users may belong to multiple teams.
  const refreshTeams = useCallback(async () => {
    try {
      const list = await api.get<AuthTeam[]>('/teams');
      setTeams(list);
      const stored =
        typeof window !== 'undefined' ? localStorage.getItem(ACTIVE_TEAM_KEY) : null;
      const stillMember = stored && list.some((t) => t.id === stored);
      _setActiveTeamId(stillMember ? stored! : list[0]?.id ?? '');
    } catch {
      setTeams([]);
      _setActiveTeamId('');
    }
  }, []);

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
      setLoading(false);
      return;
    }
    // After the user is known, resolve their teams so team-scoped pages have
    // a valid activeTeamId for their API calls.
    await refreshTeams();
    setLoading(false);
  }, [refreshTeams]);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // When an API call fails with 401 (expired/invalid token), clear the session.
  // Setting user to null triggers the AuthGuard to redirect to /login.
  useEffect(() => {
    setUnauthorizedHandler(() => logout());
    return () => setUnauthorizedHandler(null);
  }, []);

  // Token shape common to every successful auth response (login / mfa / register).
  type TokenResponse = {
    accessToken?: string;
    refreshToken?: string;
  };

  const login = async (email: string, password: string): Promise<LoginResult> => {
    const res = await api.post<LoginResult & TokenResponse>('/auth/login', {
      email,
      password,
    });
    if (res.mfaRequired && res.mfaToken) {
      // Keep the mfaToken for the second step; no session yet.
      return { mfaRequired: true, mfaToken: res.mfaToken };
    }
    setAuthToken(res.accessToken ?? null);
    setRefreshToken(res.refreshToken ?? null);
    await hydrate();
    return {};
  };

  const mfaLogin = async (mfaToken: string, code: string) => {
    const res = await api.post<TokenResponse & { accessToken: string }>(
      '/auth/mfa/login',
      { mfaToken, code },
    );
    setAuthToken(res.accessToken);
    setRefreshToken(res.refreshToken ?? null);
    await hydrate();
  };

  const register = async (email: string, password: string, name: string) => {
    const res = await api.post<TokenResponse>('/auth/register', {
      email,
      password,
      name,
    });
    setAuthToken(res.accessToken ?? null);
    setRefreshToken(res.refreshToken ?? null);
    await hydrate();
  };

  const logout = () => {
    setAuthToken(null);
    setRefreshToken(null);
    setUser(null);
    setTeams([]);
    _setActiveTeamId('');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        teams,
        activeTeamId,
        setActiveTeamId,
        refreshTeams,
        login,
        mfaLogin,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
