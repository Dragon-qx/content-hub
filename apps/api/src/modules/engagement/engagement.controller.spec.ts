import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { EngagementController } from './engagement.controller';
import { EngagementService } from './engagement.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PlatformSdkService } from '../platform-sdk/platform-sdk.service';

describe('EngagementController', () => {
  let controller: EngagementController;
  let service: any;

  beforeEach(async () => {
    service = {
      syncTeam: jest
        .fn()
        .mockResolvedValue({ teamId: 'team1', accounts: 3, comments: 7, messages: 2 }),
      firstTeamForUser: jest.fn().mockResolvedValue('team1'),
      listMessages: jest.fn().mockResolvedValue({ items: [], total: 0 }),
      ingestMessages: jest
        .fn()
        .mockResolvedValue({ stored: 4, unsupported: false, platform: 'BILIBILI' }),
      listKeywords: jest.fn().mockResolvedValue([]),
      createKeyword: jest
        .fn()
        .mockResolvedValue({ id: 'k1', teamId: 'team1', keyword: 'refund' }),
      deleteKeyword: jest.fn().mockResolvedValue({ deleted: true }),
      aiSuggestReplies: jest
        .fn()
        .mockResolvedValue({ commentId: 'c1', suggestions: [{ variant: 'grateful', confidence: 0.9, text: 'Thanks!' }] }),
    };

    const module = await Test.createTestingModule({
      controllers: [EngagementController],
      providers: [
        { provide: EngagementService, useValue: service },
        { provide: PrismaService, useValue: {} },
        { provide: PlatformSdkService, useValue: {} },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(EngagementController);
    jest.clearAllMocks();
  });

  it('requires JwtAuthGuard', () => {
    const reflector = new Reflector();
    const guards = reflector.get('__guards__', EngagementController);
    expect(guards).toContain(JwtAuthGuard);
  });

  it('sync resolves the acting team and forwards it', async () => {
    const out = await controller.sync({ userId: 'u1' } as any, {});
    expect(service.firstTeamForUser).toHaveBeenCalledWith('u1');
    expect(service.syncTeam).toHaveBeenCalledWith('team1');
    expect(out).toEqual({ teamId: 'team1', accounts: 3, comments: 7, messages: 2 });
  });

  it('sync uses an explicit teamId when supplied', async () => {
    await controller.sync({ userId: 'u1' } as any, { teamId: 'team2' });
    expect(service.syncTeam).toHaveBeenCalledWith('team2');
  });

  it('listKeywords resolves the acting team', async () => {
    await controller.listKeywords({ userId: 'u1' } as any, undefined as any);
    expect(service.firstTeamForUser).toHaveBeenCalledWith('u1');
    expect(service.listKeywords).toHaveBeenCalledWith('team1');
  });

  it('createKeyword trims nothing extra and echoes the created row', async () => {
    const out = await controller.createKeyword(
      { userId: 'u1' } as any,
      undefined as any,
      { keyword: 'refund' } as any,
    );
    expect(service.createKeyword).toHaveBeenCalledWith('team1', 'u1', 'refund');
    expect(out).toEqual({ id: 'k1', teamId: 'team1', keyword: 'refund' });
  });

  it('deleteKeyword resolves the acting team then deletes', async () => {
    await controller.deleteKeyword('k1', { userId: 'u1' } as any, undefined as any);
    expect(service.deleteKeyword).toHaveBeenCalledWith('k1', 'team1');
  });

  it('listMessages forwards filters to the service', async () => {
    await controller.listMessages({ userId: 'u1' } as any, {
      conversationId: 'conv1',
      sentByMe: false,
      skip: 0,
      take: 10,
    } as any);
    expect(service.listMessages).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId: 'team1',
        conversationId: 'conv1',
        sentByMe: false,
      }),
    );
  });

  it('ingestMessages forwards the account id', async () => {
    const out = await controller.ingestMessages({ accountId: 'acc1' } as any);
    expect(service.ingestMessages).toHaveBeenCalledWith('acc1');
    expect(out).toEqual({ stored: 4, unsupported: false, platform: 'BILIBILI' });
  });

  it('suggestReplies delegates a comment to the service engine', async () => {
    const out: any = await controller.suggestReplies('c1');
    expect(service.aiSuggestReplies).toHaveBeenCalledWith('c1');
    expect(out.suggestions[0].variant).toBe('grateful');
  });
});
