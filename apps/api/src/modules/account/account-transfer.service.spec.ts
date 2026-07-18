import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { MemberRole, TransferStatus } from '@prisma/client';
import { AccountTransferService } from './account-transfer.service';
import { PrismaService } from '../../common/prisma/prisma.service';

const mockPrisma = () => ({
  socialAccount: {
    findUnique: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
  },
  member: { findUnique: jest.fn() },
  team: { findFirst: jest.fn() },
  accountTransfer: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    update: jest.fn(),
  },
  $transaction: jest.fn(),
});

describe('AccountTransferService', () => {
  let service: AccountTransferService;
  let prisma: ReturnType<typeof mockPrisma>;

  beforeEach(async () => {
    prisma = mockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountTransferService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(AccountTransferService);
  });

  // Helper: source team admin, destination team admin, no active transfer.
  const allowAdmin = () => {
    prisma.member.findUnique.mockResolvedValue({ role: MemberRole.ADMIN });
    prisma.team.findFirst.mockResolvedValue(null);
  };

  describe('initiate', () => {
    it('rejects same-team transfer', async () => {
      await expect(
        service.initiate('team-1', {
          accountId: 'a1',
          toTeamId: 'team-1',
          initiatorUserId: 'u1',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a missing account', async () => {
      prisma.socialAccount.findUnique.mockResolvedValue(null);
      await expect(
        service.initiate('team-1', {
          accountId: 'ghost',
          toTeamId: 'team-2',
          initiatorUserId: 'u1',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects accounts not in the source team', async () => {
      prisma.socialAccount.findUnique.mockResolvedValue({ id: 'a1', teamId: 'team-other' });
      await expect(
        service.initiate('team-1', {
          accountId: 'a1',
          toTeamId: 'team-2',
          initiatorUserId: 'u1',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects a non-admin initiator', async () => {
      prisma.socialAccount.findUnique.mockResolvedValue({ id: 'a1', teamId: 'team-1' });
      prisma.member.findUnique.mockResolvedValue({ role: MemberRole.EDITOR });
      prisma.team.findFirst.mockResolvedValue(null);
      await expect(
        service.initiate('team-1', {
          accountId: 'a1',
          toTeamId: 'team-2',
          initiatorUserId: 'u1',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('accepts a team owner as initiator (owner==admin authority)', async () => {
      prisma.socialAccount.findUnique.mockResolvedValue({ id: 'a1', teamId: 'team-1' });
      prisma.member.findUnique.mockResolvedValue(null); // no member row
      prisma.team.findFirst.mockResolvedValue({ id: 'team-1' }); // but is owner
      prisma.accountTransfer.findFirst.mockResolvedValue(null);
      prisma.accountTransfer.create.mockResolvedValue({ id: 't1' });

      const res = await service.initiate('team-1', {
        accountId: 'a1',
        toTeamId: 'team-2',
        initiatorUserId: 'u1',
        note: 'offboarding',
      });
      expect(res.id).toBe('t1');
    });

    it('rejects if a PENDING transfer already exists for the account', async () => {
      allowAdmin();
      prisma.socialAccount.findUnique.mockResolvedValue({ id: 'a1', teamId: 'team-1' });
      prisma.accountTransfer.findFirst.mockResolvedValue({ id: 't-old' });
      await expect(
        service.initiate('team-1', {
          accountId: 'a1',
          toTeamId: 'team-2',
          initiatorUserId: 'u1',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('creates a PENDING transfer on success', async () => {
      allowAdmin();
      prisma.socialAccount.findUnique.mockResolvedValue({ id: 'a1', teamId: 'team-1' });
      prisma.accountTransfer.findFirst.mockResolvedValue(null);
      prisma.accountTransfer.create.mockResolvedValue({
        id: 't1',
        status: TransferStatus.PENDING,
      });

      const res = await service.initiate('team-1', {
        accountId: 'a1',
        toTeamId: 'team-2',
        initiatorUserId: 'u1',
        note: 'hi',
      });
      expect(prisma.accountTransfer.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          accountId: 'a1',
          fromTeamId: 'team-1',
          toTeamId: 'team-2',
          initiatorId: 'u1',
          status: TransferStatus.PENDING,
        }),
      });
      expect(res.status).toBe(TransferStatus.PENDING);
    });
  });

  describe('decide', () => {
    const pending = () =>
      prisma.accountTransfer.findUnique.mockResolvedValue({
        id: 't1',
        accountId: 'a1',
        fromTeamId: 'team-1',
        toTeamId: 'team-2',
        status: TransferStatus.PENDING,
      });

    it('throws NotFound when the transfer does not exist', async () => {
      prisma.accountTransfer.findUnique.mockResolvedValue(null);
      await expect(
        service.decide({ transferId: 'nope', actingUserId: 'u2', decision: 'accept' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws Conflict when the transfer is not pending', async () => {
      prisma.accountTransfer.findUnique.mockResolvedValue({
        id: 't1',
        status: TransferStatus.ACCEPTED,
      });
      await expect(
        service.decide({ transferId: 't1', actingUserId: 'u2', decision: 'accept' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects a non-admin destination actor', async () => {
      pending();
      prisma.member.findUnique.mockResolvedValue({ role: MemberRole.VIEWER });
      prisma.team.findFirst.mockResolvedValue(null);
      await expect(
        service.decide({ transferId: 't1', actingUserId: 'u2', decision: 'accept' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('accepting reassigns the account to the destination team and clears groupId', async () => {
      pending();
      allowAdmin();
      const txMock = {
        accountTransfer: { update: jest.fn().mockResolvedValue({ id: 't1', status: TransferStatus.ACCEPTED }) },
        socialAccount: { update: jest.fn().mockResolvedValue({}) },
      };
      (prisma.$transaction as jest.Mock) = jest.fn((cb: any) => cb(txMock));

      const res = await service.decide({ transferId: 't1', actingUserId: 'u2', decision: 'accept' });
      expect(txMock.socialAccount.update).toHaveBeenCalledWith({
        where: { id: 'a1' },
        data: { teamId: 'team-2', groupId: null },
      });
      expect(res.status).toBe(TransferStatus.ACCEPTED);
    });

    it('rejecting stamps REJECTED without moving the account', async () => {
      pending();
      allowAdmin();
      prisma.accountTransfer.update.mockResolvedValue({ status: TransferStatus.REJECTED });

      const res = await service.decide({ transferId: 't1', actingUserId: 'u2', decision: 'reject' });
      expect(prisma.socialAccount.update).not.toHaveBeenCalled();
      expect(res.status).toBe(TransferStatus.REJECTED);
    });
  });

  describe('cancel', () => {
    it('lets the original initiator withdraw', async () => {
      prisma.accountTransfer.findUnique.mockResolvedValue({
        id: 't1',
        fromTeamId: 'team-1',
        initiatorId: 'u1',
        status: TransferStatus.PENDING,
      });
      prisma.accountTransfer.update.mockResolvedValue({ status: TransferStatus.CANCELLED });
      const res = await service.cancel('t1', 'u1');
      expect(res.status).toBe(TransferStatus.CANCELLED);
    });

    it('rejects cancellation of a non-pending transfer', async () => {
      prisma.accountTransfer.findUnique.mockResolvedValue({
        id: 't1',
        status: TransferStatus.ACCEPTED,
      });
      await expect(service.cancel('t1', 'u1')).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('listForTeam', () => {
    it('filters incoming transfers for a team', async () => {
      prisma.accountTransfer.findMany.mockResolvedValue([{ id: 'x' }] as any);
      await service.listForTeam('team-1', { direction: 'incoming' });
      expect(prisma.accountTransfer.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ toTeamId: 'team-1' }),
        }),
      );
    });

    it('uses OR for direction "all"', async () => {
      await service.listForTeam('team-1', { direction: 'all' });
      expect(prisma.accountTransfer.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [{ fromTeamId: 'team-1' }, { toTeamId: 'team-1' }],
          }),
        }),
      );
    });
  });
});
