import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtPayload, SessionJwtPayload } from './dto/auth.dto';

export interface JwtValidatedUser extends SessionJwtPayload {
  userId: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET') ?? 'change-me-in-production',
    });
  }

  async validate(payload: JwtPayload): Promise<JwtValidatedUser> {
    // The guard extracts any bearer token, but only session tokens (access/
    // refresh) carry the claims a guarded route needs. An mfa token is rejected
    // here so it cannot be used to authorize a request.
    if (payload.type === 'mfa') {
      throw new UnauthorizedException('Two-factor authentication required');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, isActive: true },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User is inactive or does not exist');
    }

    return {
      ...payload,
      userId: payload.sub,
    };
  }
}
