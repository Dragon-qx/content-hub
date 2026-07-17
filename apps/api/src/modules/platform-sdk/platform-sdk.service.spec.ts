import { Test } from '@nestjs/testing';
import { Platform, ContentStatus } from '@prisma/client';
import { PlatformSdkService } from './platform-sdk.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CryptoService } from '../../common/crypto/crypto.service';

describe('PlatformSdkService', () => {
  let service: PlatformSdkService;
  let prisma: any;
  let crypto: any;

  const content = {
    id: 'c1',
    title: 'Hello',
    body: 'World',
    teamId: 'team-1',
    status: ContentStatus.DRAFT,
  };
  const account = {
    id: 'acc-1',
    platform: Platform.WECHAT_OFFICIAL,
    status: 'ACTIVE',
    credentials: 'v1:iv:tag:ct',
  };

  beforeEach(async () => {
    prisma = {
      content: {
        findUnique: jest.fn().mockResolvedValue(content),
        update: jest.fn().mockResolvedValue({ ...content, status: ContentStatus.PUBLISHED }),
      },
      socialAccount: {
        findFirst: jest.fn().mockResolvedValue(account),
      },
      platformPost: {
        create: jest.fn().mockResolvedValue({ id: 'post-1' }),
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    crypto = {
      decrypt: jest.fn().mockReturnValue({ appid: 'app', secret: 's' }),
    };

    const module = await Test.createTestingModule({
      providers: [
        PlatformSdkService,
        { provide: PrismaService, useValue: prisma },
        { provide: CryptoService, useValue: crypto },
      ],
    }).compile();

    service = module.get(PlatformSdkService);

    // Platform adapters call the real fetch; stub it so publish is deterministic.
    (globalThis as any).fetch = jest.fn((url: string) => {
      const u = String(url);
      let body: any = {};
      if (u.includes('cgi-bin/token')) body = { access_token: 'tok', expires_in: 7200 };
      else if (u.includes('draft/add')) body = { media_id: 'mid' };
      else if (u.includes('freepublish/submit')) body = { publish_id: 'pid' };
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);
    });

    jest.clearAllMocks();
  });

  it('should publish content and mark it PUBLISHED', async () => {
    const outcome = await service.publish('c1', Platform.WECHAT_OFFICIAL);
    expect(outcome.status).toBe('PUBLISHED');
    expect(outcome.postId).toBe('post-1');
    expect(prisma.content.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: ContentStatus.PUBLISHED }),
      }),
    );
  });

  it('should throw when content is missing', async () => {
    prisma.content.findUnique.mockResolvedValueOnce(null);
    await expect(service.publish('missing', Platform.TWITTER)).rejects.toThrow();
  });

  it('should throw when no active account is bound to the team', async () => {
    prisma.socialAccount.findFirst.mockResolvedValueOnce(null);
    await expect(service.publish('c1', Platform.TWITTER)).rejects.toThrow();
  });

  it('returns a conformant status shape', async () => {
    const result = await service.getStatus('ext-123', Platform.WECHAT_OFFICIAL);
    expect(result).toHaveProperty('externalId', 'ext-123');
    expect(result).toHaveProperty('platform');
    expect(result).toHaveProperty('status');
  });

  it('returns a conformant metrics shape', async () => {
    const result = await service.getMetrics('ext-123', Platform.WECHAT_OFFICIAL);
    expect(result).toHaveProperty('impressions');
    expect(result).toHaveProperty('engagements');
    expect(result).toHaveProperty('likes');
  });

  it('validates credentials by constructing an adapter', async () => {
    const result = await service.validate(Platform.WECHAT_OFFICIAL, {});
    expect(result).toHaveProperty('valid', true);
  });

  it('reports an unsupported platform as invalid', async () => {
    const result = await service.validate('NOPE' as Platform, {});
    expect(result).toHaveProperty('valid', false);
  });
});
