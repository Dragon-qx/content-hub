import { Test, TestingModule } from '@nestjs/testing';
import { Platform, Sentiment } from '@prisma/client';
import { EngagementService } from './engagement.service';
import {
  PlatformSdkService,
  FetchCommentsResult,
  ReplyOutcome,
} from '../platform-sdk/platform-sdk.service';
import { PrismaService } from '../../common/prisma/prisma.service';

const mockPrisma = () => ({
  socialAccount: {
    findUnique: jest.fn(),
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
});

describe('EngagementService', () => {
  let service: EngagementService;
  let prisma: ReturnType<typeof mockPrisma>;
  let sdk: { fetchComments: jest.Mock; replyToComment: jest.Mock };

  beforeEach(async () => {
    prisma = mockPrisma();
    sdk = {
      fetchComments: jest.fn(),
      replyToComment: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EngagementService,
        { provide: PrismaService, useValue: prisma },
        { provide: PlatformSdkService, useValue: sdk },
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
