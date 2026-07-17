import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { AccountService } from './account.service';
import { CryptoService } from '../../common/crypto/crypto.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PlatformAdapterFactory } from '@content-hub/platform-sdk';

// Mock the platform-sdk so we control getAuthUrl / handleCallback without any
// real HTTP. We hand back a factory function we can inspect per-adapter.
const mockGetAuthUrl = jest.fn().mockReturnValue('https://provider.test/auth?state=SEALED');
const ACCESS_TOKEN = 'AT_01J9X2ABCDEF33K'; // arbitrary; tests derive the suffix from it
const mockHandleCallback = jest.fn().mockResolvedValue({
  accessToken: ACCESS_TOKEN,
  refreshToken: 'RT-456',
  expiresAt: new Date('2026-07-18T00:00:00Z'),
});
const MockAdapter = jest.fn().mockImplementation(() => ({
  getAuthUrl: mockGetAuthUrl,
  handleCallback: mockHandleCallback,
}));

jest.mock('@content-hub/platform-sdk', () => {
  return {
    PlatformAdapterFactory: {
      create: jest.fn((_platform: string, config: Record<string, unknown>) =>
        MockAdapter({ platform: _platform, config }),
      ),
    },
  };
});

const mockCrypto = () => ({
  encrypt: jest.fn((v) => `enc:${JSON.stringify(v)}`),
  decrypt: jest.fn((v) => JSON.parse(String(v).replace('enc:', ''))),
  sealOAuthState: jest.fn((payload) => `SEALED:${payload.platform}:${payload.teamId}`),
  openOAuthState: jest.fn((token) => {
    const [, platform, teamId] = token.split(':');
    return {
      userId: 'user-1',
      teamId,
      platform,
      appKey: 'key',
      appSecret: 'secret',
      accountName: 'My Account',
      accountId: undefined,
    };
  }),
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

describe('AccountService — OAuth flow', () => {
  let service: AccountService;
  let prisma: ReturnType<typeof mockPrisma>;
  let crypto: ReturnType<typeof mockCrypto>;

  beforeEach(async () => {
    jest.clearAllMocks();
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

  describe('authorizeOAuth', () => {
    it('returns an authUrl and a sealed state token', () => {
      const result = service.authorizeOAuth(
        {
          teamId: 'team-1',
          platform: 'DOUYIN',
          appKey: 'ck',
          appSecret: 'cs',
        } as any,
        'user-1',
      );

      expect(result.authUrl).toContain('provider.test/auth');
      expect(result.state).toMatch(/^SEALED:DOUYIN:team-1$/);
      expect(crypto.sealOAuthState).toHaveBeenCalledTimes(1);
      expect(MockAdapter).toHaveBeenCalledTimes(1);
      // Config is passed with all aliases so any adapter resolves.
      const factoryCreate = (PlatformAdapterFactory as unknown as {
        create: jest.Mock;
      }).create;
      const passedConfig = factoryCreate.mock.calls[0][1];
      expect(passedConfig).toMatchObject({ appKey: 'ck', appSecret: 'cs', clientKey: 'ck' });
    });

    it('throws for an unsupported platform', () => {
      expect(() =>
        service.authorizeOAuth(
          { teamId: 't', platform: 'NOPE', appKey: 'k', appSecret: 's' } as any,
          'user-1',
        ),
      ).toThrow(BadRequestException);
    });
  });

  describe('callbackOAuth', () => {
    it('exchanges the code and binds the account, returning the verified userId', async () => {
      prisma.socialAccount.findUnique.mockResolvedValue(null);
      prisma.socialAccount.create.mockResolvedValue({ id: 'acc-1' });

      const result = await service.callbackOAuth('DOUYIN', 'code-xyz', 'SEALED:DOUYIN:team-1');

      expect(result).toEqual({ account: { id: 'acc-1' }, userId: 'user-1' });
      expect(mockHandleCallback).toHaveBeenCalledWith('code-xyz');
      expect(crypto.encrypt).toHaveBeenCalled();
      expect(prisma.socialAccount.create).toHaveBeenCalledTimes(1);
      const createData = prisma.socialAccount.create.mock.calls[0][0].data;
      expect(createData.platform).toBe('DOUYIN');
      expect(createData.teamId).toBe('team-1');
      // accountId derived from the returned access token suffix (or a fallback
      // when no token is present — covered in a later test).
      expect(createData.accountId).toBe(
        `douyin_${ACCESS_TOKEN.slice(-12)}`,
      );
    });

    it('is idempotent — refreshing tokens on an existing account', async () => {
      prisma.socialAccount.findUnique.mockResolvedValue({ id: 'acc-1' });
      prisma.socialAccount.update.mockResolvedValue({ id: 'acc-1' });

      const result = await service.callbackOAuth('DOUYIN', 'code', 'SEALED:DOUYIN:team-1');

      expect(result.userId).toBe('user-1');
      expect(prisma.socialAccount.update).toHaveBeenCalledTimes(1);
      expect(prisma.socialAccount.create).not.toHaveBeenCalled();
    });

    it('stores the obtained tokens alongside the app credentials', async () => {
      prisma.socialAccount.findUnique.mockResolvedValue(null);
      prisma.socialAccount.create.mockResolvedValue({ id: 'acc-1' });

      await service.callbackOAuth('DOUYIN', 'code', 'SEALED:DOUYIN:team-1');

      const encrypted = prisma.socialAccount.create.mock.calls[0][0].data.credentials;
      const stored = JSON.parse(String(encrypted).replace('enc:', ''));
      expect(stored.oauth).toBe(true);
      expect(stored.accessToken).toBe(ACCESS_TOKEN);
      expect(stored.refreshToken).toBe('RT-456');
      expect(stored).toMatchObject({ appKey: 'key', appSecret: 'secret' });
    });

    it('rejects a state token whose platform does not match the path', async () => {
      await expect(
        service.callbackOAuth('BILIBILI', 'code', 'SEALED:DOUYIN:team-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a malformed/expired state token', async () => {
      crypto.openOAuthState.mockImplementation(() => {
        throw new Error('expired');
      });
      await expect(
        service.callbackOAuth('DOUYIN', 'code', 'BAD'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('surfaces a clean error when the provider code exchange fails', async () => {
      mockHandleCallback.mockRejectedValueOnce(new Error('invalid_grant'));
      await expect(
        service.callbackOAuth('DOUYIN', 'code', 'SEALED:DOUYIN:team-1'),
      ).rejects.toThrow(/invalid_grant/);
    });
  });
});
