import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountStatus,
  Platform,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BindAccountDto } from './dto/account.dto';

const PUBLIC_SELECT = {
  id: true,
  teamId: true,
  platform: true,
  accountId: true,
  accountName: true,
  accountHandle: true,
  status: true,
  followerCount: true,
  followingCount: true,
  postCount: true,
  lastSyncedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

export type PublicAccount = Prisma.SocialAccountGetPayload<{
  select: typeof PUBLIC_SELECT;
}>;

@Injectable()
export class AccountService {
  constructor(private readonly prisma: PrismaService) {}

  async listForTeam(teamId: string): Promise<PublicAccount[]> {
    return this.prisma.socialAccount.findMany({
      where: { teamId },
      select: PUBLIC_SELECT,
    });
  }

  async listForUser(userId: string): Promise<PublicAccount[]> {
    const memberships = await this.prisma.member.findMany({
      where: { userId },
      select: { teamId: true },
    });
    const teamIds = memberships.map((m) => m.teamId);
    if (teamIds.length === 0) {
      return [];
    }
    return this.prisma.socialAccount.findMany({
      where: { teamId: { in: teamIds } },
      select: PUBLIC_SELECT,
    });
  }

  async get(id: string): Promise<PublicAccount> {
    const account = await this.prisma.socialAccount.findUnique({
      where: { id },
      select: PUBLIC_SELECT,
    });
    if (!account) {
      throw new NotFoundException('Account not found');
    }
    return account;
  }

  async bind(teamId: string, dto: BindAccountDto): Promise<PublicAccount> {
    if (!Object.values(Platform).includes(dto.platform as Platform)) {
      throw new BadRequestException('Unsupported platform');
    }

    const existing = await this.prisma.socialAccount.findUnique({
      where: {
        platform_accountId: { platform: dto.platform, accountId: dto.accountId },
      },
    });
    if (existing) {
      throw new BadRequestException('This social account is already bound');
    }

    return this.prisma.socialAccount.create({
      data: {
        teamId,
        platform: dto.platform,
        accountId: dto.accountId,
        accountName: dto.accountName,
        accountHandle: dto.accountHandle,
        credentials: dto.credentials as Prisma.InputJsonValue,
        status: AccountStatus.ACTIVE,
      },
      select: PUBLIC_SELECT,
    });
  }

  async unbind(id: string) {
    await this.get(id);
    await this.prisma.socialAccount.delete({ where: { id } });
    return { deleted: true, id };
  }
}
