import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JwtPayload } from '../dto/auth.dto';

export interface AuthUser {
  userId: string;
  email: string;
  role: string;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx.switchToHttp().getRequest();
    const payload = request.user as JwtPayload;
    // Routes using this decorator are protected by JwtAuthGuard, which only
    // accepts session tokens (access/refresh). The mfa token is short-lived and
    // never reaches a guarded route, so narrowing on `type` is sound.
    const session = payload.type === 'mfa' ? null : payload;
    if (!session) {
      throw new Error('No session token on guarded route');
    }
    return {
      userId: session.sub,
      email: session.email,
      role: session.role,
    };
  },
);
