export interface SessionJwtPayload {
  sub: string;
  email: string;
  role: string;
  type: 'access' | 'refresh';
}

/** Short-lived, password-verified-but-MFA-pending token. No role/email: it is
 *  never used to authorize a request, only to redeem a TOTP code. */
export interface MfaJwtPayload {
  sub: string;
  type: 'mfa';
}

export type JwtPayload = SessionJwtPayload | MfaJwtPayload;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}
