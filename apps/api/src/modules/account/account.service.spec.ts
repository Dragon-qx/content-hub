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
    count: jest.fn().mockResolvedValue(0),
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
    it('returns a paged envelope for a team', async () => {
      prisma.socialAccount.findMany.mockResolvedValue([{ id: 'a1' }]);
      prisma.socialAccount.count.mockResolvedValue(1);
      const result = await service.listForTeam('team-1');
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.skip).toBe(0);
      expect(result.take).toBe(20);
    });

    it('applies skip/take to the team query', async () => {
      prisma.socialAccount.findMany.mockResolvedValue([]);
      prisma.socialAccount.count.mockResolvedValue(0);
      const result = await service.listForTeam('team-1', { skip: 10, take: 5 });
      expect(result.skip).toBe(10);
      expect(result.take).toBe(5);
      const findManyArg = prisma.socialAccount.findMany.mock.calls[0][0];
      expect(findManyArg.skip).toBe(10);
      expect(findManyArg.take).toBe(5);
    });

    it('returns an empty envelope when the user has no teams', async () => {
      prisma.member.findMany.mockResolvedValue([]);
      const result = await service.listForUser('lonely');
      expect(result).toEqual({ items: [], total: 0, skip: 0, take: 20 });
    });

    it('pages accounts across all of a user\'s teams', async () => {
      prisma.member.findMany.mockResolvedValue([{ teamId: 't1' }, { teamId: 't2' }]);
      prisma.socialAccount.findMany.mockResolvedValue([{ id: 'a1' }, { id: 'a2' }]);
      prisma.socialAccount.count.mockResolvedValue(2);
      const result = await service.listForUser('u1', { skip: 0, take: 10 });
      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
      const findManyArg = prisma.socialAccount.findMany.mock.calls[0][0];
      expect(findManyArg.where).toEqual({ teamId: { in: ['t1', 't2'] } });
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

  describe('parseImportCsv', () => {
    it('maps CSV rows into AccountImportRow objects', () => {
      const csv =
        'platform,accountId,accountName,appid,secret\n' +
        'WECHAT_OFFICIAL,wx1,Brand,myappid,mysecret\n' +
        'DOUYIN,dy1,Douyin,ck,cs';
      const { rows, parseErrors } = service.parseImportCsv(csv);
      expect(parseErrors).toHaveLength(0);
      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({
        platform: 'WECHAT_OFFICIAL',
        accountId: 'wx1',
        accountName: 'Brand',
        credentials: { appid: 'myappid', secret: 'mysecret' },
      });
    });

    it('surfaces ragged rows as parse errors but still parses the good ones', () => {
      const csv =
        'platform,accountId,accountName\n' +
        'WECHAT_OFFICIAL,wx1\n' + // missing column
        'DOUYIN,dy1,Douyin';
      const { rows, parseErrors } = service.parseImportCsv(csv);
      expect(rows).toHaveLength(1);
      expect(parseErrors).toHaveLength(1);
    });
  });

  describe('batchImport', () => {
    beforeEach(() => {
      prisma.socialAccount.findUnique.mockResolvedValue(null);
      prisma.socialAccount.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: `acc-${data.accountId}`, ...data }),
      );
    });

    it('binds every row on a happy path and reports success counts', async () => {
      const summary = await service.batchImport('team-1', [
        { platform: 'WECHAT_OFFICIAL', accountId: 'wx1', accountName: 'Brand' },
        { platform: 'DOUYIN', accountId: 'dy1', accountName: 'Douyin' },
      ]);
      expect(summary.total).toBe(2);
      expect(succeeded(summary)).toBe(2);
      expect(failed(summary)).toBe(0);
      expect(crypto.encrypt).toHaveBeenCalledTimes(2);
    });

    it('skips rows with an invalid platform and records the error', async () => {
      const summary = await service.batchImport('team-1', [
        { platform: 'WECHAT_OFFICIAL', accountId: 'wx1', accountName: 'Brand' },
        { platform: 'NOT_A_PLATFORM', accountId: 'bad', accountName: 'Bad' },
      ]);
      expect(succeeded(summary)).toBe(1);
      expect(failed(summary)).toBe(1);
      expect(summary.results[1].error).toMatch(/Unsupported platform/);
    });

    it('skips rows that are missing required fields', async () => {
      const summary = await service.batchImport('team-1', [
        { platform: 'WECHAT_OFFICIAL', accountId: '', accountName: 'Brand' },
      ]);
      expect(failed(summary)).toBe(1);
      expect(summary.results[0].error).toMatch(/accountId and accountName/);
    });

    it('skips already-bound accounts and records the error without throwing', async () => {
      prisma.socialAccount.findUnique.mockResolvedValue(null);
      prisma.socialAccount.findUnique
        .mockResolvedValueOnce(null)            // first row — not bound
        .mockResolvedValueOnce({ id: 'existing' }); // second row — already bound
      const summary = await service.batchImport('team-1', [
        { platform: 'WECHAT_OFFICIAL', accountId: 'wx1', accountName: 'Brand' },
        { platform: 'DOUYIN', accountId: 'dy1', accountName: 'Douyin' },
      ]);
      expect(succeeded(summary)).toBe(1);
      expect(failed(summary)).toBe(1);
      expect(summary.results[1].error).toMatch(/already bound/);
    });

    it('continues when a persist failure occurs and reports it', async () => {
      prisma.socialAccount.create
        .mockResolvedValueOnce({ id: 'acc-wx1' })
        .mockRejectedValueOnce(new Error('db down'));
      const summary = await service.batchImport('team-1', [
        { platform: 'WECHAT_OFFICIAL', accountId: 'wx1', accountName: 'Brand' },
        { platform: 'DOUYIN', accountId: 'dy1', accountName: 'Douyin' },
      ]);
      expect(succeeded(summary)).toBe(1);
      expect(failed(summary)).toBe(1);
      expect(summary.results[1].error).toBe('db down');
    });

    it('returns zeroes for an empty input array', async () => {
      const summary = await service.batchImport('team-1', []);
      expect(summary.total).toBe(0);
      expect(summary.results).toEqual([]);
    });
  });
});

function succeeded(s: { succeeded: number }) { return s.succeeded; }
function failed(s: { failed: number }) { return s.failed; }
