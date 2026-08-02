import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MemberRole } from '@prisma/client';
import { TeamAccessService } from './team-access.service';

export const TEAM_ACCESS_KEY = 'team_access';
export const TeamAccess = (minRole: MemberRole = 'VIEWER') =>
  SetMetadata(TEAM_ACCESS_KEY, minRole);

@Injectable()
export class TeamAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly teamAccess: TeamAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const minRole = this.reflector.getAllAndOverride<MemberRole>(TEAM_ACCESS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!minRole) return true; // no team access requirement

    const req = context.switchToHttp().getRequest();
    const user = req.user as { userId?: string } | undefined;
    if (!user?.userId) return false;

    // Try to get teamId from params, query, or body
    const teamId =
      req.params?.teamId ||
      req.query?.teamId ||
      req.body?.teamId ||
      req.params?.id ||
      req.query?.id;

    if (teamId && typeof teamId === 'string') {
      await this.teamAccess.assertUserRole(user.userId, teamId, minRole);
      return true;
    }

    // If no teamId in request, just check the user has at least one team
    const firstTeam = await this.teamAccess.firstTeamForUser(user.userId);
    return !!firstTeam;
  }
}
