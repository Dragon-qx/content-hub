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
    await controller.publish({
      contentId: 'c1',
      platform: 'TWITTER' as any,
      payload: { foo: 'bar' },
    });
    expect(service.publish).toHaveBeenCalledWith('c1', 'TWITTER', { foo: 'bar' });
  });

  it('validate forwards platform and credentials', async () => {
    await controller.validate({ platform: 'TWITTER' as any, credentials: { tok: 'x' } });
    expect(service.validate).toHaveBeenCalledWith('TWITTER', { tok: 'x' });
  });
});
