import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CryptoService } from '../../common/crypto/crypto.service';
import { AuditService } from '../audit/audit.service';
import { TeamService } from '../team/team.service';
import { MfaService } from './mfa.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto, RefreshTokenDto } from './dto/login.dto';
import { AuthTokens, JwtPayload } from './dto/auth.dto';
import { MfaCodeDto, MfaLoginDto, MfaRequiredView, MfaSetupView } from './dto/mfa.dto';
import { MfaJwtPayload, SessionJwtPayload } from './dto/auth.dto';

export type LoginResult =
  | AuthTokens
  | (MfaRequiredView & { mfaRequired: true });

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly crypto: CryptoService,
    private readonly mfa: MfaService,
    private readonly audit: AuditService,
    private readonly teams: TeamService,
  ) {}

  private accessExpiresIn(): string {
    return this.config.get<string>('JWT_EXPIRES_IN') ?? '15m';
  }

  private refreshExpiresIn(): string {
    return this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d';
  }

  private refreshSecret(): string {
    return (
      this.config.get<string>('JWT_REFRESH_SECRET') ??
      this.config.get<string>('JWT_SECRET') ??
      'change-me-in-production'
    );
  }

  private async signTokens(
    sub: string,
    email: string,
    role: UserRole,
  ): Promise<AuthTokens> {
    const payload: JwtPayload = { sub, email, role, type: 'access' };
    const refreshPayload: JwtPayload = { sub, email, role, type: 'refresh' };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        expiresIn: this.accessExpiresIn(),
      }),
      this.jwtService.signAsync(refreshPayload, {
        expiresIn: this.refreshExpiresIn(),
        secret: this.refreshSecret(),
      }),
    ]);

    return { accessToken, refreshToken };
  }

  /**
   * Issue a short-lived token that represents a password-verified but
   * MFA-pending login. It carries a distinct `type: 'mfa'` so it cannot be
   * mistaken for a session token, and it redeems at most one TOTP code.
   */
  private async signMfaToken(sub: string): Promise<string> {
    return this.jwtService.signAsync(
      { sub, type: 'mfa' } as MfaJwtPayload,
      { expiresIn: '5m' },
    );
  }

  async register(dto: RegisterDto): Promise<AuthTokens> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('该邮箱已被注册');
    }

    const passwordHash = await argon2.hash(dto.password);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        passwordHash,
        role: UserRole.OWNER,
      },
    });

    // Every user needs a team to operate. Auto-provision a personal default
    // team so team-scoped flows (accounts, contents, analytics) work out of
    // the box. teamService.create also adds the creator as an ADMIN member.
    await this.teams.create(user.id, {
      name: `${user.name}的团队`,
    });

    return this.signTokens(user.id, user.email, user.role);
  }

  /**
   * Verify email + password. If the account has MFA enabled, do not issue
   * session tokens — return an `mfaToken` the client must redeem with a TOTP
   * code via {@link mfaLogin}. This keeps the two factors on separate requests
   * and prevents a partial login from being usable as a session.
   */
  async login(dto: LoginDto): Promise<LoginResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('邮箱或密码错误');
    }

    const valid = await argon2.verify(user.passwordHash, dto.password);
    if (!valid) {
      throw new UnauthorizedException('邮箱或密码错误');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    if (user.mfaEnabled && user.mfaSecret) {
      const mfaToken = await this.signMfaToken(user.id);
      return { mfaRequired: true, mfaToken };
    }

    const tokens = await this.signTokens(user.id, user.email, user.role);

    await this.audit.log('LOGIN', user.id, 'User', user.id, {
      email: user.email,
      mfa: false,
    });

    return tokens;
  }

  /**
   * Redeem an `mfaToken` plus a valid TOTP code for session tokens. The secret
   * is stored encrypted at rest, so it is decrypted in memory for verification.
   * A failed code does not lock the account (the throttler bounds attempts).
   */
  async mfaLogin(dto: MfaLoginDto): Promise<AuthTokens> {
    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(dto.mfaToken);
    } catch {
      throw new UnauthorizedException('登录验证已过期，请重新登录');
    }
    if (payload.type !== 'mfa') {
      throw new UnauthorizedException('验证令牌类型错误');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        mfaEnabled: true,
        mfaSecret: true,
      },
    });
    if (!user || !user.isActive || !user.mfaEnabled || !user.mfaSecret) {
      throw new UnauthorizedException('账号未开启两步验证');
    }

    const secret = this.crypto.decrypt<string>(user.mfaSecret);
    if (!this.mfa.verify(secret, dto.code)) {
      throw new UnauthorizedException('验证码错误');
    }

    const tokens = await this.signTokens(user.id, user.email, user.role);
    await this.audit.log('LOGIN', user.id, 'User', user.id, {
      email: user.email,
      mfa: true,
    });
    return tokens;
  }

  /**
   * Begin MFA setup: generate a fresh secret, persist it encrypted, and return
   * the plaintext secret + provisioning URI so the user can add it to their
   * authenticator. MFA is **not** enabled until the user proves they saved it
   * by submitting a code to {@link enableMfa} — this prevents an abandoned
   * setup from locking the account.
   */
  async setupMfa(userId: string): Promise<MfaSetupView> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('用户不存在');
    }
    if (user.mfaEnabled) {
      throw new ConflictException('两步验证已开启');
    }

    const secret = this.mfa.generateSecret();
    const encrypted = this.crypto.encrypt(secret);

    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaSecret: encrypted },
    });

    return {
      secret,
      otpauthUrl: this.mfa.getOtpauthUrl(secret, user.email),
    };
  }

  /** Confirm setup by verifying a code against the pending secret, then enable MFA. */
  async enableMfa(userId: string, dto: MfaCodeDto): Promise<{ enabled: true }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { mfaEnabled: true, mfaSecret: true, email: true },
    });
    if (!user) {
      throw new UnauthorizedException('用户不存在');
    }
    if (user.mfaEnabled) {
      throw new ConflictException('两步验证已开启');
    }
    if (!user.mfaSecret) {
      throw new ConflictException('请先完成验证器配置');
    }

    const secret = this.crypto.decrypt<string>(user.mfaSecret);
    if (!this.mfa.verify(secret, dto.code)) {
      throw new UnauthorizedException('验证码错误，未能开启两步验证');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: true },
    });
    await this.audit.log('MFA_ENABLE', userId, 'User', userId, {
      email: user.email,
    });
    return { enabled: true };
  }

  /** Disable MFA and clear the stored secret. Requires an authenticated session. */
  async disableMfa(userId: string): Promise<{ enabled: false }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { mfaEnabled: true, email: true, mfaSecret: true },
    });
    if (!user) {
      throw new UnauthorizedException('用户不存在');
    }
    if (!user.mfaEnabled && !user.mfaSecret) {
      throw new ConflictException('两步验证未开启');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: false, mfaSecret: null },
    });
    await this.audit.log('MFA_DISABLE', userId, 'User', userId, {
      email: user.email,
    });
    return { enabled: false };
  }

  /** Whether the calling user has MFA enabled (surfaced to the frontend). */
  async getStatus(userId: string): Promise<{ mfaEnabled: boolean }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { mfaEnabled: true },
    });
    if (!user) {
      throw new UnauthorizedException('用户不存在');
    }
    return { mfaEnabled: user.mfaEnabled };
  }

  async refresh(dto: RefreshTokenDto): Promise<AuthTokens> {
    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(
        dto.refreshToken,
        { secret: this.refreshSecret() },
      );
    } catch {
      throw new UnauthorizedException('刷新令牌无效或已过期');
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('刷新令牌类型错误');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true, isActive: true },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('用户不存在或已被禁用');
    }

    return this.signTokens(user.id, user.email, user.role);
  }
}
