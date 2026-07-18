import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { PlatformSdkController } from './platform-sdk.controller';
import { PlatformSdkService } from './platform-sdk.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

describe('PlatformSdkController', () => {
  let controller: PlatformSdkController;
  let service: any;

  beforeEach(async () => {
    service = {
      publish: jest.fn().mockResolvedValue({ id: 'pp-1', status: 'PENDING' }),
      getStatus: jest.fn().mockResolvedValue({ status: 'PUBLISHED' }),
      getMetrics: jest.fn().mockResolvedValue({ impressions: 0 }),
      validate: jest.fn().mockResolvedValue({ valid: true }),
      fetchComments: jest.fn().mockResolvedValue({ items: [], unsupported: false }),
      replyToComment: jest.fn().mockResolvedValue({ ok: true }),
      fetchMessages: jest.fn().mockResolvedValue({ items: [], unsupported: false }),
    };

    const module = await Test.createTestingModule({
      controllers: [PlatformSdkController],
      providers: [{ provide: PlatformSdkService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(PlatformSdkController);
    jest.clearAllMocks();
  });

  it('requires JwtAuthGuard', () => {
    const reflector = new Reflector();
    const guards = reflector.get('__guards__', PlatformSdkController);
    expect(guards).toContain(JwtAuthGuard);
  });

  it('publish forwards contentId, platform and payload', async () => {
    await controller.publish(
      { contentId: 'c1', platform: 'TWITTER' as any, payload: { foo: 'bar' } },
      undefined,
    );
    expect(service.publish).toHaveBeenCalledWith('c1', 'TWITTER', { foo: 'bar' }, undefined);
  });

  it('validate forwards platform and credentials', async () => {
    await controller.validate({ platform: 'TWITTER' as any, credentials: { tok: 'x' } });
    expect(service.validate).toHaveBeenCalledWith('TWITTER', { tok: 'x' });
  });

  it('getComments forwards accountId, platform and optional postExternalId', async () => {
    await controller.getComments({
      accountId: 'acc-1',
      platform: 'BILIBILI' as any,
      postExternalId: 'BV123',
    });
    expect(service.fetchComments).toHaveBeenCalledWith('acc-1', 'BILIBILI', 'BV123');
  });

  it('getComments omits postExternalId when not supplied', async () => {
    await controller.getComments({ accountId: 'acc-1', platform: 'BILIBILI' as any });
    expect(service.fetchComments).toHaveBeenCalledWith('acc-1', 'BILIBILI', undefined);
  });

  it('replyToComment forwards accountId, platform, commentId and content', async () => {
    await controller.replyToComment({
      accountId: 'acc-1',
      platform: 'BILIBILI' as any,
      commentId: 'c-1',
      content: 'thanks',
    });
    expect(service.replyToComment).toHaveBeenCalledWith('acc-1', 'BILIBILI', 'c-1', 'thanks');
  });

  it('getMessages forwards accountId and platform', async () => {
    await controller.getMessages({ accountId: 'acc-1', platform: 'BILIBILI' as any });
    expect(service.fetchMessages).toHaveBeenCalledWith('acc-1', 'BILIBILI');
  });
});
