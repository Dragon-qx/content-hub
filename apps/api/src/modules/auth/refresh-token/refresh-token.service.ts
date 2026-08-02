import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../../../common/prisma/prisma.service';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface RefreshResult extends TokenPair {
  rotated: boolean;
}

@Injectable()
export class RefreshTokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  private get refreshSecret(): string {
    return (
      this.config.get<string>('JWT_REFRESH_SECRET') ??
      this.config.get<string>('JWT_SECRET') ??
      'change-me-in-production'
    );
  }

  private get refreshExpiresIn(): string {
    return this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d';
  }

  private get accessExpiresIn(): string {
    return this.config.get<string>('JWT_EXPIRES_IN') ?? '15m';
  }

  /** Hash a refresh token for secure storage (SHA-256) */
  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /** Generate a cryptographically random refresh token */
  private generateRefreshToken(): string {
    return randomBytes(64).toString('base64url');
  }

  /**
   * Create a new token pair with server-side refresh token storage.
   * Returns both tokens; the refresh token is stored hashed in the DB.
   */
  async createTokenPair(
    userId: string,
    email: string,
    role: string,
    metadata?: { userAgent?: string; ipAddress?: string },
  ): Promise<TokenPair> {
    // Sign access token (short-lived, stateless)
    const accessToken = await this.jwtService.signAsync(
      { sub: userId, email, role, type: 'access' },
      { expiresIn: this.accessExpiresIn },
    );

    // Generate refresh token (opaque, stored hashed)
    const refreshToken = this.generateRefreshToken();
    const tokenHash = this.hashToken(refreshToken);
    const familyId = randomBytes(16).toString('hex');

    // Calculate expiry
    const expiresIn = this.refreshExpiresIn;
    const expiresAt = this.calculateExpiry(expiresIn);

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash,
        familyId,
        userAgent: metadata?.userAgent,
        ipAddress: metadata?.ipAddress,
        expiresAt,
      },
    });

    return { accessToken, refreshToken };
  }

  /**
   * Rotate a refresh token: verify the old token, issue a new pair.
   * Implements reuse detection: if a rotated token is reused, revoke the
   * entire family (all tokens derived from the same original).
   */
  async rotateRefreshToken(
    oldRefreshToken: string,
    metadata?: { userAgent?: string; ipAddress?: string },
  ): Promise<RefreshResult> {
    const tokenHash = this.hashToken(oldRefreshToken);

    // Find the stored token
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!stored) {
      // Token not found — might be a reused/revoked token
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Check if expired
    if (stored.expiresAt < new Date()) {
      await this.prisma.refreshToken.delete({ where: { id: stored.id } });
      throw new UnauthorizedException('Refresh token expired');
    }

    // Check if revoked
    if (stored.revoked) {
      throw new UnauthorizedException('Refresh token revoked');
    }

    // Reuse detection: if token was already rotated, someone stole it
    if (stored.rotated) {
      // Revoke ALL tokens in this family — the legitimate user and the attacker
      await this.prisma.refreshToken.updateMany({
        where: { familyId: stored.familyId },
        data: { revoked: true },
      });
      throw new UnauthorizedException('Refresh token reuse detected — all sessions revoked');
    }

    // Mark old token as rotated
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { rotated: true },
    });

    // Issue new token pair (same family for tracking)
    const accessToken = await this.jwtService.signAsync(
      { sub: stored.userId, email: stored.user.email, role: stored.user.role, type: 'access' },
      { expiresIn: this.accessExpiresIn },
    );

    const newRefreshToken = this.generateRefreshToken();
    const newTokenHash = this.hashToken(newRefreshToken);
    const expiresAt = this.calculateExpiry(this.refreshExpiresIn);

    await this.prisma.refreshToken.create({
      data: {
        userId: stored.userId,
        tokenHash: newTokenHash,
        familyId: stored.familyId,
        userAgent: metadata?.userAgent,
        ipAddress: metadata?.ipAddress,
        expiresAt,
      },
    });

    return { accessToken, refreshToken: newRefreshToken, rotated: true };
  }

  /**
   * Revoke all refresh tokens for a user (logout all devices).
   */
  async revokeAllUserTokens(userId: string): Promise<number> {
    const result = await this.prisma.refreshToken.updateMany({
      where: { userId, revoked: false },
      data: { revoked: true },
    });
    return result.count;
  }

  /**
   * Revoke a specific refresh token family.
   */
  async revokeTokenFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId },
      data: { revoked: true },
    });
  }

  /**
   * Clean up expired tokens (call periodically from a worker).
   */
  async cleanupExpiredTokens(): Promise<number> {
    const result = await this.prisma.refreshToken.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    return result.count;
  }

  /** Calculate expiry date from a duration string like '7d', '15m' */
  private calculateExpiry(duration: string): Date {
    const match = duration.match(/^(\d+)([smhd])$/);
    if (!match) return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // default 7d

    const value = parseInt(match[1], 10);
    const unit = match[2];
    const multipliers: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };

    return new Date(Date.now() + value * (multipliers[unit] || multipliers.d));
  }
}
