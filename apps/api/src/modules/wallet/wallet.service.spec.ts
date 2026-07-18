import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { TransactionType } from '@prisma/client';
import { WalletService } from './wallet.service';
import { PrismaService } from '../../common/prisma/prisma.service';

const mockPrisma = () => ({
  wallet: {
    findUnique: jest.fn(),
    create: jest.fn(),
    upsert: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  walletTransaction: {
    create: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
  },
  $transaction: jest.fn(),
});

describe('WalletService', () => {
  let service: WalletService;
  let prisma: ReturnType<typeof mockPrisma>;

  beforeEach(async () => {
    prisma = mockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(WalletService);
  });

  describe('getOrCreateWallet', () => {
    it('returns existing wallet when present', async () => {
      const existing = { id: 'w1', teamId: 'team-1', balance: 100 };
      prisma.wallet.findUnique.mockResolvedValue(existing as any);
      const res = await service.getOrCreateWallet('team-1');
      expect(res).toBe(existing);
      expect(prisma.wallet.create).not.toHaveBeenCalled();
    });

    it('creates a wallet when none exists', async () => {
      prisma.wallet.findUnique.mockResolvedValue(null);
      prisma.wallet.create.mockResolvedValue({ id: 'w1', teamId: 'team-1', balance: 0 } as any);
      const res = await service.getOrCreateWallet('team-1');
      expect(res.teamId).toBe('team-1');
      expect(prisma.wallet.create).toHaveBeenCalledWith({
        data: { teamId: 'team-1', balance: 0, holdBalance: 0 },
      });
    });
  });

  describe('balance', () => {
    it('returns zero balance for a missing wallet', async () => {
      prisma.wallet.findUnique.mockResolvedValue(null);
      const res = await service.balance('team-1');
      expect(res.balance).toBe(0);
      expect(res.available).toBe(0);
      expect(res.currency).toBe('CREDIT');
    });

    it('returns the stored balance minus holds', async () => {
      prisma.wallet.findUnique.mockResolvedValue({ id: 'w1', balance: 100, holdBalance: 30, currency: 'CREDIT' } as any);
      const res = await service.balance('team-1');
      expect(res.balance).toBe(100);
      expect(res.holdBalance).toBe(30);
      expect(res.available).toBe(70);
    });
  });

  describe('topUp', () => {
    it('rejects non-positive amounts', async () => {
      await expect(service.topUp('team-1', { amount: 0 })).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.topUp('team-1', { amount: -5 })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('upserts the wallet and writes an atomic ledger entry', async () => {
      const tx = {
        wallet: {
          upsert: jest.fn().mockResolvedValue({ id: 'w1', teamId: 'team-1', balance: 200 }),
        },
        walletTransaction: {
          create: jest.fn().mockResolvedValue({ id: 'tx1' }),
        },
      };
      (prisma.$transaction as jest.Mock).mockImplementation((cb: any) => cb(tx));

      const res: any = await service.topUp('team-1', { amount: 200, note: 'seed' });
      expect(tx.wallet.upsert).toHaveBeenCalled();
      expect(res.wallet.balance).toBe(200);
      expect(tx.walletTransaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          walletId: 'w1',
          type: TransactionType.TOPUP,
          amount: 200,
          balanceAfter: 200,
        }),
      });
    });
  });

  describe('debit', () => {
    it('returns null for a free operation type', async () => {
      const res = await service.debit('team-1', TransactionType.TOPUP);
      expect(res).toBeNull();
    });

    it('throws NotFound when wallet is missing', async () => {
      prisma.wallet.findUnique.mockResolvedValue(null);
      await expect(
        service.debit('team-1', TransactionType.PUBLISH),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws ConflictException on insufficient balance', async () => {
      prisma.wallet.findUnique.mockResolvedValue({ id: 'w1', balance: 1 } as any);
      await expect(
        service.debit('team-1', TransactionType.PUBLISH),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('atomically decrements and appends a ledger entry', async () => {
      prisma.wallet.findUnique.mockResolvedValue({ id: 'w1', balance: 100 } as any);
      const tx = {
        wallet: { update: jest.fn().mockResolvedValue({ id: 'w1', balance: 90 }) },
        walletTransaction: {
          create: jest.fn().mockResolvedValue({ id: 'tx1' }),
        },
      };
      (prisma.$transaction as jest.Mock).mockImplementation((cb: any) => cb(tx));

      const res: any = await service.debit('team-1', TransactionType.PUBLISH, {
        refId: 'job-1',
      });
      expect(tx.wallet.update).toHaveBeenCalledWith({
        where: { id: 'w1' },
        data: { balance: { decrement: 10 } },
      });
      expect(res.wallet.balance).toBe(90);
    });
  });

  describe('tryDebit (lenient)', () => {
    it('returns false on insufficient balance when lenient', async () => {
      prisma.wallet.findUnique.mockResolvedValue({ id: 'w1', balance: 1 } as any);
      const ok = await service.tryDebit('team-1', TransactionType.PUBLISH, { lenient: true });
      expect(ok).toBe(false);
    });

    it('returns true on success', async () => {
      prisma.wallet.findUnique.mockResolvedValue({ id: 'w1', balance: 100 } as any);
      const tx = {
        wallet: { update: jest.fn().mockResolvedValue({ id: 'w1', balance: 90 }) },
        walletTransaction: { create: jest.fn().mockResolvedValue({}) },
      };
      (prisma.$transaction as jest.Mock).mockImplementation((cb: any) => cb(tx));
      const ok = await service.tryDebit('team-1', TransactionType.PUBLISH);
      expect(ok).toBe(true);
    });

    it('propagates non-conflict errors even when lenient', async () => {
      prisma.wallet.findUnique.mockResolvedValue(null);
      await expect(
        service.tryDebit('team-1', TransactionType.PUBLISH, { lenient: true }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('listTransactions', () => {
    it('writes nothing for a non-existent wallet', async () => {
      prisma.wallet.findUnique.mockResolvedValue(null);
      const res = await service.listTransactions('team-1');
      expect(res.items).toEqual([]);
      expect(res.total).toBe(0);
    });

    it('returns paginated entries when wallet exists', async () => {
      prisma.wallet.findUnique.mockResolvedValue({ id: 'w1' } as any);
      prisma.walletTransaction.findMany.mockResolvedValue([{ id: 'tx1' }] as any);
      prisma.walletTransaction.count.mockResolvedValue(1);
      const res = await service.listTransactions('team-1', { skip: 0, take: 20 });
      expect(res.items).toHaveLength(1);
      expect(res.total).toBe(1);
    });
  });

  describe('price table', () => {
    it('exposes a mutable rate card', () => {
      const prices = service.getPrices();
      expect(prices[TransactionType.PUBLISH]).toBeGreaterThan(0);
      expect(prices[TransactionType.TOPUP]).toBe(0);
    });

    it('allows price overrides', () => {
      service.setPrices({ [TransactionType.PUBLISH]: 42 });
      const prices = service.getPrices();
      expect(prices[TransactionType.PUBLISH]).toBe(42);
    });
  });
});
