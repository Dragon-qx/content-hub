import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Member, MemberRole, Team } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AddMemberDto, CreateTeamDto, UpdateTeamDto } from './dto/team.dto';

@Injectable()
export class TeamService {
  constructor(private readonly prisma: PrismaService) {}

  async create(ownerId: string, dto: CreateTeamDto): Promise<Team> {
    return this.prisma.team.create({
      data: {
        name: dto.name,
        description: dto.description,
        ownerId,
        members: {
          create: { userId: ownerId, role: MemberRole.ADMIN },
        },
      },
    });
  }

  async findAllForUser(userId: string) {
    const memberships = await this.prisma.member.findMany({
      where: { userId },
      include: { team: true },
    });
    return memberships.map((m) => m.team);
  }

  async findById(id: string): Promise<Team> {
    const team = await this.prisma.team.findUnique({ where: { id } });
    if (!team) {
      throw new NotFoundException('Team not found');
    }
    return team;
  }

  async update(id: string, userId: string, dto: UpdateTeamDto): Promise<Team> {
    await this.assertOwner(id, userId);
    return this.prisma.team.update({ where: { id }, data: dto });
  }

  async remove(id: string, userId: string): Promise<{ deleted: true }> {
    await this.assertOwner(id, userId);
    await this.prisma.team.delete({ where: { id } });
    return { deleted: true };
  }

  async listMembers(teamId: string) {
    return this.prisma.member.findMany({ where: { teamId } });
  }

  async addMember(
    teamId: string,
    userId: string,
    dto: AddMemberDto,
  ): Promise<Member> {
    await this.assertOwner(teamId, userId);
    const role = this.parseMemberRole(dto.role);

    const existing = await this.prisma.member.findUnique({
      where: { teamId_userId: { teamId, userId: dto.userId } },
    });
    if (existing) {
      throw new BadRequestException('User is already a member of this team');
    }

    return this.prisma.member.create({
      data: { teamId, userId: dto.userId, role },
    });
  }

  async removeMember(
    teamId: string,
    userId: string,
    memberId: string,
  ): Promise<{ deleted: true }> {
    await this.assertOwner(teamId, userId);
    if (memberId === userId) {
      throw new BadRequestException('Owner cannot remove themselves');
    }
    await this.prisma.member.delete({ where: { id: memberId } });
    return { deleted: true };
  }

  private async assertOwner(teamId: string, userId: string): Promise<void> {
    const team = await this.findById(teamId);
    if (team.ownerId !== userId) {
      throw new ForbiddenException('Only the team owner can perform this action');
    }
  }

  private parseMemberRole(role: string): MemberRole {
    const allowed: MemberRole[] = [
      MemberRole.ADMIN,
      MemberRole.EDITOR,
      MemberRole.VIEWER,
    ];
    if (!allowed.includes(role as MemberRole)) {
      throw new BadRequestException(
        `Invalid role. Allowed: ${allowed.join(', ')}`,
      );
    }
    return role as MemberRole;
  }
}
