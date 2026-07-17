import { Test, TestingModule } from '@nestjs/testing';
import { Platform, Sentiment, Prisma } from '@prisma/client';
import { EngagementService } from './engagement.service';
import {
  PlatformSdkService,
  FetchCommentsResult,
  ReplyOutcome,
} from '../platform-sdk/platform-sdk.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';

const mockPrisma = () => ({
  socialAccount: {
    findUnique: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    update: jest.fn().mockResolvedValue({}),
  },
  platformPost: {
    findFirst: jest.fn().mockResolvedValue(null),
  },
  engagementComment: {
    upsert: jest.fn().mockResolvedValue({ id: 'ec1' }),
    findMany: jest.fn(),
    count: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn().mockResolvedValue({ id: 'ec1', replied: true }),
    groupBy: jest.fn(),
  },
  member: {
    findFirst: jest.fn(),
  },
  team: {
    findFirst: jest.fn(),
  },
  commentTemplate: {
    findMany: jest.fn(),
    create: jest.fn(),
    findFirst: jest.fn(),
    delete: jest.fn(),
  },
  sentimentKeyword: {
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    findFirst: jest.fn(),
    delete: jest.fn(),
  },
});

describe('EngagementService', () => {
  let service: EngagementService;
  let prisma: ReturnType<typeof mockPrisma>;
  let sdk: { fetchComments: jest.Mock; replyToComment: jest.Mock };
  let notifications: { broadcastToTeam: jest.Mock };

  beforeEach(async () => {
    prisma = mockPrisma();
    sdk = {
      fetchComments: jest.fn(),
      replyToComment: jest.fn(),
    };
    notifications = {
      broadcastToTeam: jest.fn().mockResolvedValue({ count: 2 }),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EngagementService,
        { provide: PrismaService, useValue: prisma },
        { provide: PlatformSdkService, useValue: sdk },
        { provide: NotificationService, useValue: notifications },
      ],
    }).compile();

    service = module.get(EngagementService);
  });

  describe('ingest', () => {
    it('upserts each scraped comment with derived sentiment and returns stored count', async () => {
      prisma.socialAccount.findUnique.mockResolvedValue({
        id: 'acc1',
        platform: Platform.DOUYIN,
        accountId: 'ext-acc',
        credentials: '{}',
      });
      const result: FetchCommentsResult = {
        accountId: 'acc1',
        platform: Platform.DOUYIN,
        unsupported: false,
        items: [
          { id: 'c1', authorName: 'fan', content: '太棒了！很喜欢', createdAt: new Date() },
          { id: 'c2', authorName: 'hater', content: '差评，很难用', createdAt: new Date() },
        ],
      };
      sdk.fetchComments.mockResolvedValue(result);

      const out = await service.ingest('acc1');

      expect(out.stored).toBe(2);
      expect(out.unsupported).toBe(false);
      expect(prisma.engagementComment.upsert).toHaveBeenCalledTimes(2);
      // Positive comment (thanks/great keywords) should land POSITIVE.
      const firstCall = prisma.engagementComment.upsert.mock.calls[0][0];
      expect(firstCall.create.sentiment).toBe(Sentiment.POSITIVE);
      expect(firstCall.create.sentimentScore).toBeGreaterThan(0);
      // Negative comment should land NEGATIVE.
      const secondCall = prisma.engagementComment.upsert.mock.calls[1][0];
      expect(secondCall.create.sentiment).toBe(Sentiment.NEGATIVE);
      expect(secondCall.create.sentimentScore).toBeLessThan(0);
    });

    it('treats an unsupported adapter as a no-op with unsupported:true', async () => {
      prisma.socialAccount.findUnique.mockResolvedValue({
        id: 'acc1',
        platform: Platform.BILIBILI,
        accountId: 'ext',
        credentials: '{}',
      });
      sdk.fetchComments.mockResolvedValue({
        accountId: 'acc1',
        platform: Platform.BILIBILI,
        unsupported: true,
        items: [],
      });

      const out = await service.ingest('acc1');

      expect(out.stored).toBe(0);
      expect(out.unsupported).toBe(true);
      expect(prisma.engagementComment.upsert).not.toHaveBeenCalled();
    });

    it('alerts the team when a new comment matches a watch keyword', async () => {
      prisma.socialAccount.findUnique.mockResolvedValue({
        id: 'acc1',
        platform: Platform.DOUYIN,
        accountId: 'ext-acc',
        teamId: 'team1',
        accountName: 'Douyin Official',
        credentials: '{}',
      });
      prisma.sentimentKeyword.findMany.mockResolvedValue([
        { keyword: 'refund' },
        { keyword: '垃圾' },
      ]);
      sdk.fetchComments.mockResolvedValue({
        accountId: 'acc1',
        platform: Platform.DOUYIN,
        unsupported: false,
        items: [
          { id: 'c1', authorName: 'fan', content: '我要退款，体验垃圾', createdAt: new Date() },
        ],
      });

      await service.ingest('acc1');

      expect(notifications.broadcastToTeam).toHaveBeenCalledTimes(1);
      expect(notifications.broadcastToTeam).toHaveBeenCalledWith(
        'team1',
        expect.objectContaining({ type: 'warning', title: expect.any(String) }),
      );
      // Marked alerted so it won't re-alert next sync.
      expect(prisma.engagementComment.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { alerted: true } }),
      );
    });

    it('alerts on a strongly negative comment even without a keyword match', async () => {
      prisma.socialAccount.findUnique.mockResolvedValue({
        id: 'acc1',
        platform: Platform.DOUYIN,
        accountId: 'ext-acc',
        teamId: 'team1',
        accountName: 'Douyin Official',
        credentials: '{}',
      });
      // No watch keywords configured.
      prisma.sentimentKeyword.findMany.mockResolvedValue([]);
      sdk.fetchComments.mockResolvedValue({
        accountId: 'acc1',
        platform: Platform.DOUYIN,
        unsupported: false,
        items: [
          { id: 'c1', authorName: 'hater', content: '差评，垃圾，非常失望，恶心', createdAt: new Date() },
        ],
      });

      await service.ingest('acc1');

      expect(notifications.broadcastToTeam).toHaveBeenCalledTimes(1);
    });

    it('does not alert for a neutral new comment', async () => {
      prisma.socialAccount.findUnique.mockResolvedValue({
        id: 'acc1',
        platform: Platform.DOUYIN,
        accountId: 'ext-acc',
        teamId: 'team1',
        accountName: 'Douyin Official',
        credentials: '{}',
      });
      prisma.sentimentKeyword.findMany.mockResolvedValue([{ keyword: 'refund' }]);
      sdk.fetchComments.mockResolvedValue({
        accountId: 'acc1',
        platform: Platform.DOUYIN,
        unsupported: false,
        items: [
          { id: 'c1', authorName: 'user', content: '今天天气不错', createdAt: new Date() },
        ],
      });

      await service.ingest('acc1');

      expect(notifications.broadcastToTeam).not.toHaveBeenCalled();
    });

    it('does not re-alert for an already-seen comment', async () => {
      prisma.socialAccount.findUnique.mockResolvedValue({
        id: 'acc1',
        platform: Platform.DOUYIN,
        accountId: 'ext-acc',
        teamId: 'team1',
        accountName: 'Douyin Official',
        credentials: '{}',
      });
      prisma.sentimentKeyword.findMany.mockResolvedValue([{ keyword: '垃圾' }]);
      // Comment already exists and was alerted on a previous sync.
      prisma.engagementComment.findUnique.mockResolvedValue({
        id: 'ec1',
        alerted: true,
        content: '体验垃圾',
      });
      sdk.fetchComments.mockResolvedValue({
        accountId: 'acc1',
        platform: Platform.DOUYIN,
        unsupported: false,
        items: [
          { id: 'c1', authorName: 'fan', content: '体验垃圾', createdAt: new Date() },
        ],
      });

      await service.ingest('acc1');

      expect(notifications.broadcastToTeam).not.toHaveBeenCalled();
    });

    it('keeps ingesting even if alert broadcast fails', async () => {
      prisma.socialAccount.findUnique.mockResolvedValue({
        id: 'acc1',
        platform: Platform.DOUYIN,
        accountId: 'ext-acc',
        teamId: 'team1',
        accountName: 'Douyin Official',
        credentials: '{}'
      });
      prisma.sentimentKeyword.findMany.mockResolvedValue([{ keyword: '垃圾' }]);
      sdk.fetchComments.mockResolvedValue({
        accountId: 'acc1',
        platform: Platform.DOUYIN,
        unsupported: false,
        items: [
          { id: 'c1', authorName: 'fan', content: '体验垃圾', createdAt: new Date() },
        ],
      });
      notifications.broadcastToTeam.mockRejectedValueOnce(new Error('email down'));

      await expect(service.ingest('acc1')).resolves.toMatchObject({ stored: 1 });
    });
  });

  describe('listComments', () => {
    it('filters by team with optional sentiment and unreplied, paginates', async () => {
      prisma.engagementComment.findMany.mockResolvedValue([{ id: 'ec1' }]);
      prisma.engagementComment.count.mockResolvedValue(1);

      const out = await service.listComments({
        teamId: 'team1',
        sentiment: Sentiment.NEGATIVE,
        unreplied: true,
        skip: 0,
        take: 20,
      });

      expect(out.items).toHaveLength(1);
      expect(out.total).toBe(1);
      expect(prisma.engagementComment.findMany.mock.calls[0][0]).toMatchObject({
        where: {
          account: { teamId: 'team1' },
          sentiment: Sentiment.NEGATIVE,
          replied: false,
        },
        take: 20,
      });
    });
  });

  describe('reply', () => {
    it('delegates to the SDK and marks the comment replied', async () => {
      prisma.engagementComment.findUnique.mockResolvedValue({
        id: 'ec1',
        accountId: 'acc1',
        platform: Platform.DOUYIN,
        externalId: 'c1',
      });
      sdk.replyToComment.mockResolvedValue({ ok: true });

      const out = await service.reply('ec1', '谢谢支持！');

      expect(out.ok).toBe(true);
      expect(sdk.replyToComment).toHaveBeenCalledWith(
        'acc1',
        Platform.DOUYIN,
        'c1',
        '谢谢支持！',
      );
      expect(prisma.engagementComment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'ec1' },
          data: expect.objectContaining({ replied: true, replyContent: '谢谢支持！' }),
        }),
      );
    });
  });

  describe('stats', () => {
    it('aggregates totals, unreplied and per-platform breakdown', async () => {
      prisma.engagementComment.groupBy.mockResolvedValue([
        { platform: Platform.DOUYIN, sentiment: Sentiment.POSITIVE, replied: true, _count: { _all: 2 } },
        { platform: Platform.DOUYIN, sentiment: Sentiment.NEGATIVE, replied: false, _count: { _all: 1 } },
        { platform: Platform.BILIBILI, sentiment: Sentiment.NEUTRAL, replied: false, _count: { _all: 1 } },
      ]);

      const out = await service.stats('team1');

      expect(out.total).toBe(4);
      expect(out.unreplied).toBe(2);
      expect(out.positive).toBe(2);
      expect(out.negative).toBe(1);
      expect(out.neutral).toBe(1);
      expect(out.byPlatform).toEqual(
        expect.arrayContaining([
          { platform: Platform.DOUYIN, total: 3, unreplied: 1 },
          { platform: Platform.BILIBILI, total: 1, unreplied: 1 },
        ]),
      );
    });
  });

  describe('syncTeam', () => {
    it('ingests comments for every active account in a team', async () => {
      prisma.socialAccount.findMany.mockResolvedValue([
        { id: 'acc1' },
        { id: 'acc2' },
      ]);
      prisma.sentimentKeyword.findMany.mockResolvedValue([]);
      prisma.socialAccount.findUnique
        .mockResolvedValueOnce({
          id: 'acc1',
          platform: Platform.DOUYIN,
          teamId: 'team1',
          credentials: '{}',
        })
        .mockResolvedValueOnce({
          id: 'acc2',
          platform: Platform.BILIBILI,
          teamId: 'team1',
          credentials: '{}',
        });
      prisma.engagementComment.findUnique.mockResolvedValue(null);
      sdk.fetchComments.mockResolvedValue({
        accountId: 'acc1',
        platform: Platform.DOUYIN,
        unsupported: false,
        items: [{ id: 'c1', authorName: 'fan', content: 'nice', createdAt: new Date() }],
      });

      const out = await service.syncTeam('team1');

      expect(out).toEqual({ teamId: 'team1', accounts: 2, stored: 2 });
      expect(sdk.fetchComments).toHaveBeenCalledTimes(2);
    });

    it('skips accounts that throw and continues the rest', async () => {
      prisma.socialAccount.findMany.mockResolvedValue([{ id: 'acc1' }]);
      prisma.socialAccount.findUnique.mockResolvedValue({
        id: 'acc1',
        platform: Platform.DOUYIN,
        teamId: 'team1',
        credentials: '{}',
      });
      sdk.fetchComments.mockRejectedValueOnce(new Error('network down'));

      const out = await service.syncTeam('team1');

      expect(out).toEqual({ teamId: 'team1', accounts: 1, stored: 0 });
    });
  });

  describe('syncAllTeams', () => {
    it('syncs each distinct team that has active accounts', async () => {
      prisma.socialAccount.findMany.mockResolvedValue([{ teamId: 'team1' }]);
      prisma.socialAccount.findUnique.mockResolvedValue({
        id: 'acc1',
        platform: Platform.DOUYIN,
        teamId: 'team1',
        credentials: '{}',
      });
      prisma.sentimentKeyword.findMany.mockResolvedValue([]);
      prisma.engagementComment.findUnique.mockResolvedValue(null);
      sdk.fetchComments.mockResolvedValue({
        accountId: 'acc1',
        platform: Platform.DOUYIN,
        unsupported: false,
        items: [{ id: 'c1', authorName: 'fan', content: 'nice', createdAt: new Date() }],
      });

      const out = await service.syncAllTeams();

      expect(out).toEqual([{ teamId: 'team1', accounts: 1, stored: 1 }]);
    });
  });

  describe('keywords', () => {
    it('lists keywords for a team', async () => {
      prisma.sentimentKeyword.findMany.mockResolvedValue([
        { id: 'k1', teamId: 'team1', keyword: 'refund' },
      ]);
      const out = await service.listKeywords('team1');
      expect(out).toHaveLength(1);
      expect(prisma.sentimentKeyword.findMany.mock.calls[0][0]).toMatchObject({
        where: { teamId: 'team1' },
      });
    });

    it('creates a keyword and trims whitespace', async () => {
      prisma.sentimentKeyword.create.mockResolvedValue({
        id: 'k1',
        teamId: 'team1',
        keyword: 'refund',
      });
      const out = await service.createKeyword('team1', 'u1', '  refund  ');
      expect(out.keyword).toBe('refund');
      expect(prisma.sentimentKeyword.create).toHaveBeenCalledWith({
        data: { teamId: 'team1', keyword: 'refund', createdBy: 'u1' },
      });
    });

    it('rejects an empty keyword', async () => {
      await expect(service.createKeyword('team1', 'u1', '   ')).rejects.toThrow(
        /must not be empty/,
      );
    });

    it('surfaces a duplicate keyword on unique-constraint conflict', async () => {
      const p2002 = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        { code: 'P2002', clientVersion: '5.0.0' } as any,
      );
      prisma.sentimentKeyword.create.mockRejectedValueOnce(p2002);
      await expect(
        service.createKeyword('team1', 'u1', 'refund'),
      ).rejects.toThrow(/already exists/);
    });

    it('deletes a keyword only if it belongs to the team', async () => {
      prisma.sentimentKeyword.findFirst.mockResolvedValue({ id: 'k1' });
      await expect(service.deleteKeyword('k1', 'team1')).resolves.toMatchObject({
        deleted: true,
      });
      expect(prisma.sentimentKeyword.delete).toHaveBeenCalledWith({
        where: { id: 'k1' },
      });
    });

    it('throws when deleting a keyword that does not belong to the team', async () => {
      prisma.sentimentKeyword.findFirst.mockResolvedValue(null);
      await expect(service.deleteKeyword('k1', 'team1')).rejects.toThrow(
        /not found/,
      );
    });
  });

  describe('firstTeamForUser', () => {
    it('returns the earliest membership team', async () => {
      prisma.member.findFirst.mockResolvedValue({ teamId: 'team-a' });
      expect(await service.firstTeamForUser('u1')).toBe('team-a');
    });
    it('falls back to an owned team when no membership exists', async () => {
      prisma.member.findFirst.mockResolvedValue(null);
      prisma.team.findFirst.mockResolvedValue({ id: 'owned' });
      expect(await service.firstTeamForUser('u1')).toBe('owned');
    });
    it('throws when the user belongs to no team', async () => {
      prisma.member.findFirst.mockResolvedValue(null);
      prisma.team.findFirst.mockResolvedValue(null);
      await expect(service.firstTeamForUser('nobody')).rejects.toThrow(/not a member of any team/);
    });
  });
});
