import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AccountService } from './account.service';
import { CryptoService } from '../../common/crypto/crypto.service';
import { PrismaService } from '../../common/prisma/prisma.service';

jest.mock('@content-hub/platform-sdk', () => {
  return {
    WechatOfficialAdapter: jest.fn().mockImplementation(() => ({
      getAccessToken: jest.fn().mockResolvedValue('token'),
      getFollowerCount: jest.fn().mockResolvedValue(100),
    })),
  };
});

const mockCrypto = () => ({
  encrypt: jest.fn((v) => `enc:${JSON.stringify(v)}`),
  decrypt: jest.fn((v) => JSON.parse(String(v).replace('enc:', ''))),
});

const mockPrisma = () => ({
  socialAccount: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  member: { findMany: jest.fn().mockResolvedValue([]) },
});

describe('AccountService', () => {
  let service: AccountService;
  let prisma: ReturnType<typeof mockPrisma>;
  let crypto: ReturnType<typeof mockCrypto>;

  beforeEach(async () => {
    prisma = mockPrisma();
    crypto = mockCrypto();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountService,
        { provide: PrismaService, useValue: prisma },
        { provide: CryptoService, useValue: crypto },
      ],
    }).compile();

    service = module.get(AccountService);
  });

  describe('bind', () => {
    it('encrypts credentials before storing', async () => {
      prisma.socialAccount.findUnique.mockResolvedValue(null);
      prisma.socialAccount.create.mockResolvedValue({ id: 'acc-1' });

      await service.bind('team-1', {
        teamId: 'team-1',
        platform: 'WECHAT_OFFICIAL',
        accountId: 'wx1',
        accountName: 'Official',
        appid: 'app',
        secret: 'sec',
      } as any);

      const createArg = prisma.socialAccount.create.mock.calls[0][0];
      expect(crypto.encrypt).toHaveBeenCalled();
      expect(createArg.data.credentials).toMatch(/^enc:/);
    });

    it('rejects an already-bound account', async () => {
      prisma.socialAccount.findUnique.mockResolvedValue({ id: 'acc-1' });
      await expect(
        service.bind('team-1', {
          teamId: 'team-1',
          platform: 'TWITTER',
          accountId: 't1',
          accountName: 'T',
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('update', () => {
    it('re-encrypts merged credentials', async () => {
      prisma.socialAccount.findUnique.mockResolvedValue({
        id: 'acc-1',
        credentials: 'enc:{"appid":"old"}',
      });
      prisma.socialAccount.update.mockResolvedValue({ id: 'acc-1' });

      await service.update('acc-1', { credentials: { secret: 'new' } });

      const updateArg = prisma.socialAccount.update.mock.calls[0][0];
      expect(crypto.decrypt).toHaveBeenCalled();
      expect(updateArg.data.credentials).toMatch(/^enc:/);
    });

    it('throws NotFound for a missing account', async () => {
      prisma.socialAccount.findUnique.mockResolvedValue(null);
      await expect(service.update('ghost', { accountName: 'x' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('listForTeam / listForUser', () => {
    it('returns accounts for a team', async () => {
      prisma.socialAccount.findMany.mockResolvedValue([{ id: 'a1' }]);
      const result = await service.listForTeam('team-1');
      expect(result).toHaveLength(1);
    });

    it('returns an empty list when the user has no teams', async () => {
      prisma.member.findMany.mockResolvedValue([]);
      const result = await service.listForUser('lonely');
      expect(result).toEqual([]);
    });
  });

  describe('get', () => {
    it('throws NotFound for unknown account', async () => {
      prisma.socialAccount.findUnique.mockResolvedValue(null);
      await expect(service.get('ghost')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('bind', () => {
    it('rejects unsupported platforms', async () => {
      await expect(
        service.bind('team-1', { platform: 'NOPE', accountId: '1', accountName: 'x' } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('unbind', () => {
    it('deletes the account', async () => {
      prisma.socialAccount.findUnique.mockResolvedValue({ id: 'acc-1' });
      prisma.socialAccount.delete.mockResolvedValue({ id: 'acc-1' });
      const result = await service.unbind('acc-1');
      expect(result).toEqual({ deleted: true, id: 'acc-1' });
    });
  });

  describe('sync', () => {
    it('decrypts credentials before calling the adapter', async () => {
      prisma.socialAccount.findUnique.mockResolvedValue({
        id: 'acc-1',
        platform: 'WECHAT_OFFICIAL',
        credentials: 'enc:{"appid":"app","secret":"sec"}',
        accountId: 'wx1',
      });

      const result = await service.sync('acc-1');
      expect(crypto.decrypt).toHaveBeenCalledWith('enc:{"appid":"app","secret":"sec"}');
      // WechatOfficialAdapter is not mocked; expect a handled failure (not a crash).
      expect(result).toHaveProperty('success');
    });
  });
});
