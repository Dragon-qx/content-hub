import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateAccountGroupDto, UpdateAccountGroupDto } from './dto/account-group.dto';

@Injectable()
export class AccountGroupService {
  private readonly logger = new Logger(AccountGroupService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(teamId: string, dto: CreateAccountGroupDto) {
    return this.prisma.accountGroup.create({
      data: { teamId, name: dto.name, description: dto.description, color: dto.color },
    });
  }

  async listForTeam(teamId: string) {
    return this.prisma.accountGroup.findMany({
      where: { teamId },
      include: { _count: { select: { accounts: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async get(id: string) {
    const group = await this.prisma.accountGroup.findUnique({
      where: { id },
      include: { accounts: { select: { id: true, platform: true, accountName: true, status: true } } },
    });
    if (!group) throw new NotFoundException('Account group not found');
    return group;
  }

  async update(id: string, dto: UpdateAccountGroupDto) {
    await this.get(id);
    return this.prisma.accountGroup.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.color !== undefined && { color: dto.color }),
      },
    });
  }

  async delete(id: string) {
    await this.get(id);
    await this.prisma.accountGroup.delete({ where: { id } });
    return { deleted: true, id };
  }

  async assignAccount(groupId: string, accountId: string) {
    const group = await this.get(groupId);
    const account = await this.prisma.socialAccount.findUnique({ where: { id: accountId } });
    if (!account) throw new NotFoundException('Account not found');
    if (account.teamId !== group.teamId) {
      throw new BadRequestException('Account does not belong to this team');
    }
    return this.prisma.socialAccount.update({
      where: { id: accountId },
      data: { groupId },
      select: { id: true, groupId: true },
    });
  }

  async removeAccount(groupId: string, accountId: string) {
    const account = await this.prisma.socialAccount.findUnique({ where: { id: accountId } });
    if (!account || account.groupId !== groupId) {
      throw new BadRequestException('Account is not in this group');
    }
    return this.prisma.socialAccount.update({
      where: { id: accountId },
      data: { groupId: null },
      select: { id: true, groupId: true },
    });
  }
}
