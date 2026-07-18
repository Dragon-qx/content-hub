import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AccountStatus, Platform } from '@prisma/client';
import { HealthService, HealthStatus } from './health.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CryptoService } from '../../common/crypto/crypto.service';
import { NotificationService } from '../notification/notification.service';
import { ConfigService } from '@nestjs/config';

const mockCrypto = () => ({
  // Echo JSON through an "enc:" prefix so the decrypt path round-trips.
  encrypt: jest.fn((v) => `enc:${JSON.stringify(v)}`),
  decrypt: jest.fn((v) => JSON.parse(String(v).replace('enc:', ''))),
});

const mockPrisma = () => ({
  socialAccount: {
    findUnique: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
  },
  publishJob: {
    count: jest.fn().mockResolvedValue(0),
  },
});

const mockNotifications = () => ({
  broadcastToTeam: jest.fn().mockResolvedValue({ count: 0 }),
});

const DAY = 24 * 60 * 60 * 1000;

describe('HealthService', () => {
  let service: HealthService;
  let prisma: ReturnType<typeof mockPrisma>;
  let crypto: ReturnType<typeof mockCrypto>;
  let notifications: ReturnType<typeof mockNotifications>;

  const baseAccount = {
    id: 'acc-1',
    platform: Platform.WECHAT_OFFICIAL,
    accountName: 'Official',
    status: AccountStatus.ACTIVE,
    lastSyncedAt: new Date(Date.now() - 2 * DAY),
    credentials: 'enc:{}',
  };

  beforeEach(async () => {
    prisma = mockPrisma();
    crypto = mockCrypto();
    notifications = mockNotifications();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        { provide: PrismaService, useValue: prisma },
        { provide: CryptoService, useValue: crypto },
        { provide: NotificationService, useValue: notifications },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    service = module.get(HealthService);
  });

  describe('evaluateAccount', () => {
    it('returns HEALTHY for a freshly-synced active account', async () => {
      prisma.socialAccount.findUnique.mockResolvedValue(baseAccount);
      prisma.publishJob.count.mockResolvedValue(0);

      const result = await service.evaluateAccount('acc-1');

      expect(result.health).toBe('HEALTHY');
      expect(result.signals).toEqual([]);
      expect(result.accountId).toBe('acc-1');
      expect(result.lastSyncedAt).toBe(baseAccount.lastSyncedAt.toISOString());
    });

    it('throws NotFoundException when the account does not exist', async () => {
      prisma.socialAccount.findUnique.mockResolvedValue(null);
      await expect(service.evaluateAccount('ghost')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('flags a token expiring within 7 days as WARNING', async () => {
      prisma.socialAccount.findUnique.mockResolvedValue({
        ...baseAccount,
        credentials: 'enc:{"expiresAt":"2026-01-01T00:00:00.000Z"}',
      });
      // Pin expiry to 3 days from now via ISO relative to a real now.
      const expires = new Date(Date.now() + 3 * DAY).toISOString();
      prisma.socialAccount.findUnique.mockResolvedValue({
        ...baseAccount,
        credentials: `enc:{"expiresAt":"${expires}"}`,
      });

      const result = await service.evaluateAccount('acc-1');

      expect(result.health).toBe('WARNING');
      expect(result.signals).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ signal: 'TOKEN_EXPIRES_SOON', severity: 'warning' }),
        ]),
      );
      expect(result.tokenExpiresAt).toBe(expires);
    });

    it('flags an already-expired token as CRITICAL', async () => {
      const expired = new Date(Date.now() - 2 * DAY).toISOString();
      prisma.socialAccount.findUnique.mockResolvedValue({
        ...baseAccount,
        credentials: `enc:{"expiresAt":"${expired}"}`,
        lastSyncedAt: new Date(Date.now() - 10 * DAY),
      });

      const result = await service.evaluateAccount('acc-1');

      expect(result.health).toBe('CRITICAL');
      expect(result.signals).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ signal: 'TOKEN_EXPIRED', severity: 'critical' }),
        ]),
      );
    });

    it('flags an account that never synced as STALE_DATA WARNING', async () => {
      prisma.socialAccount.findUnique.mockResolvedValue({
        ...baseAccount,
        lastSyncedAt: null,
        credentials: 'enc:{}',
      });

      const result = await service.evaluateAccount('acc-1');

      expect(result.health).toBe('WARNING');
      expect(result.signals).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ signal: 'STALE_DATA', severity: 'warning' }),
        ]),
      );
    });

    it('flags an account not synced in >=7 days as STALE_DATA WARNING', async () => {
      prisma.socialAccount.findUnique.mockResolvedValue({
        ...baseAccount,
        lastSyncedAt: new Date(Date.now() - 10 * DAY),
        credentials: 'enc:{}',
      });

      const result = await service.evaluateAccount('acc-1');

      expect(result.signals).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ signal: 'STALE_DATA' }),
        ]),
      );
    });

    it('flags API quota consumed >= 80% as WARNING', async () => {
      prisma.socialAccount.findUnique.mockResolvedValue({
        ...baseAccount,
        credentials: 'enc:{"rateLimitRemaining":18,"rateLimitTotal":100}',
      });

      const result = await service.evaluateAccount('acc-1');

      expect(result.signals).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ signal: 'API_LIMIT_HIGH', severity: 'warning' }),
        ]),
      );
    });

    it('flags 1-2 publish failures as a warning and 3+ as critical', async () => {
      prisma.socialAccount.findUnique.mockResolvedValue(baseAccount);

      prisma.publishJob.count.mockResolvedValue(1);
      const warn = await service.evaluateAccount('acc-1');
      expect(warn.signals).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ signal: 'RECENT_PUBLISH_FAILURES', severity: 'warning' }),
        ]),
      );

      prisma.publishJob.count.mockResolvedValue(3);
      const crit = await service.evaluateAccount('acc-1');
      expect(crit.health).toBe('CRITICAL');
      expect(crit.signals).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ signal: 'CONSECUTIVE_FAILURES', severity: 'critical' }),
        ]),
      );
    });

    it('flags a non-active account status as CRITICAL', async () => {
      prisma.socialAccount.findUnique.mockResolvedValue({
        ...baseAccount,
        status: AccountStatus.EXPIRED,
      });

      const result = await service.evaluateAccount('acc-1');

      expect(result.health).toBe('CRITICAL');
      expect(result.signals).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ signal: 'ACCOUNT_INACTIVE', severity: 'critical' }),
        ]),
      );
    });

    it('rolls up the worst severity across signals', async () => {
      // One warning (stale) + one critical (expired token) => CRITICAL.
      const expired = new Date(Date.now() - DAY).toISOString();
      prisma.socialAccount.findUnique.mockResolvedValue({
        ...baseAccount,
        lastSyncedAt: new Date(Date.now() - 20 * DAY),
        credentials: `enc:{"expiresAt":"${expired}"}`,
      });

      const result = await service.evaluateAccount('acc-1');

      expect(result.health).toBe('CRITICAL');
    });
  });

  describe('evaluateTeam', () => {
    it('aggregates per-status totals across the team', async () => {
      const now = Date.now();
      prisma.socialAccount.findMany.mockResolvedValue([
        { ...baseAccount, id: 'a1', lastSyncedAt: new Date(now - DAY), credentials: 'enc:{}' },
        { ...baseAccount, id: 'a2', status: AccountStatus.SUSPENDED, lastSyncedAt: new Date(now - DAY), credentials: 'enc:{}' },
        {
          ...baseAccount,
          id: 'a3',
          lastSyncedAt: null,
          credentials: 'enc:{}',
        },
      ]);

      const result = await service.evaluateTeam('team-1');

      expect(result.teamId).toBe('team-1');
      expect(result.totals.total).toBe(3);
      expect(result.totals.healthy).toBe(1);
      expect(result.totals.critical).toBe(1); // SUSPENDED
      expect(result.totals.warning).toBe(1); // never synced
      expect(result.accounts).toHaveLength(3);
    });
  });

  describe('runTeamCheck', () => {
    it('broadcasts a notification to the team when accounts are degraded', async () => {
      const now = Date.now();
      prisma.socialAccount.findMany.mockResolvedValue([
        { ...baseAccount, id: 'a1', lastSyncedAt: new Date(now - DAY), credentials: 'enc:{}' },
        { ...baseAccount, id: 'a2', status: AccountStatus.SUSPENDED, lastSyncedAt: new Date(now - DAY), credentials: 'enc:{}' },
      ]);

      const { summary, notified } = await service.runTeamCheck('team-1');

      expect(notified).toBe(1);
      expect(notifications.broadcastToTeam).toHaveBeenCalledTimes(1);
      expect(notifications.broadcastToTeam).toHaveBeenCalledWith(
        'team-1',
        expect.objectContaining({
          type: 'error', // CRITICAL present
          title: expect.stringContaining('critical'),
          metadata: expect.objectContaining({
            teamId: 'team-1',
            accountIds: ['a2'],
          }),
        }),
      );
      expect(summary.totals.critical).toBe(1);
    });

    it('does not broadcast when every account is healthy', async () => {
      const now = Date.now();
      prisma.socialAccount.findMany.mockResolvedValue([
        { ...baseAccount, id: 'a1', lastSyncedAt: new Date(now - DAY), credentials: 'enc:{}' },
      ]);

      const { notified } = await service.runTeamCheck('team-1');

      expect(notified).toBe(0);
      expect(notifications.broadcastToTeam).not.toHaveBeenCalled();
    });

    it('skips broadcasting when notify=false', async () => {
      const now = Date.now();
      prisma.socialAccount.findMany.mockResolvedValue([
        { ...baseAccount, id: 'a1', status: AccountStatus.SUSPENDED, lastSyncedAt: new Date(now - DAY), credentials: 'enc:{}' },
      ]);

      const { notified } = await service.runTeamCheck('team-1', false);

      expect(notified).toBe(0);
      expect(notifications.broadcastToTeam).not.toHaveBeenCalled();
    });

    it('uses a warning tone when degraded accounts are only warnings', async () => {
      const now = Date.now();
      prisma.socialAccount.findMany.mockResolvedValue([
        { ...baseAccount, id: 'a1', lastSyncedAt: null, credentials: 'enc:{}' },
      ]);

      await service.runTeamCheck('team-1');

      expect(notifications.broadcastToTeam).toHaveBeenCalledWith(
        'team-1',
        expect.objectContaining({ type: 'warning' }),
      );
    });
  });
});
