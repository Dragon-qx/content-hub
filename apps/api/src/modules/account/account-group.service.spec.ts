import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AccountGroupService } from './account-group.service';
import { PrismaService } from '../../common/prisma/prisma.service';

const mockPrisma = () => ({
  accountGroup: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  socialAccount: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
});

describe('AccountGroupService', () => {
  let service: AccountGroupService;
  let prisma: ReturnType<typeof mockPrisma>;

  beforeEach(async () => {
    prisma = mockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountGroupService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(AccountGroupService);
  });

  it('creates a group', async () => {
    prisma.accountGroup.create.mockResolvedValue({ id: 'g1' });
    await service.create('team-1', { name: 'Brand A', color: '#ff0000' });
    expect(prisma.accountGroup.create).toHaveBeenCalledWith({
      data: { teamId: 'team-1', name: 'Brand A', description: undefined, color: '#ff0000' },
    });
  });

  it('lists groups with account counts', async () => {
    prisma.accountGroup.findMany.mockResolvedValue([{ id: 'g1', _count: { accounts: 3 } }]);
    const result = await service.listForTeam('team-1');
    expect(result).toHaveLength(1);
    expect(result[0]._count.accounts).toBe(3);
  });

  it('throws NotFound on missing group', async () => {
    prisma.accountGroup.findUnique.mockResolvedValue(null);
    await expect(service.get('x')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('assigns account to group (same team only)', async () => {
    prisma.accountGroup.findUnique.mockResolvedValue({ id: 'g1', teamId: 'team-1' });
    prisma.socialAccount.findUnique.mockResolvedValue({ id: 'a1', teamId: 'team-1' });
    prisma.socialAccount.update.mockResolvedValue({ id: 'a1', groupId: 'g1' });
    const result = await service.assignAccount('g1', 'a1');
    expect(result.groupId).toBe('g1');
  });

  it('rejects assign when account is in different team', async () => {
    prisma.accountGroup.findUnique.mockResolvedValue({ id: 'g1', teamId: 'team-1' });
    prisma.socialAccount.findUnique.mockResolvedValue({ id: 'a1', teamId: 'team-2' });
    await expect(service.assignAccount('g1', 'a1')).rejects.toBeInstanceOf(BadRequestException);
  });
});
