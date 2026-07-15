import { Test } from '@nestjs/testing';
import { PlatformSdkService } from './platform-sdk.service';

describe('PlatformSdkService', () => {
  let service: PlatformSdkService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [PlatformSdkService],
    }).compile();
    service = module.get(PlatformSdkService);
  });

  it('should publish content to platform', async () => {
    const result = await service.publish('c1', 'TWITTER', { text: 'Hello' });
    expect(result).toHaveProperty('id');
    expect(result).toHaveProperty('contentId', 'c1');
    expect(result).toHaveProperty('platform', 'TWITTER');
    expect(result).toHaveProperty('status', 'PENDING');
  });

  it('should get status of external post', async () => {
    const result = await service.getStatus('ext-123', 'TWITTER');
    expect(result).toHaveProperty('status', 'PUBLISHED');
    expect(result).toHaveProperty('externalId', 'ext-123');
  });

  it('should get metrics for external post', async () => {
    const result = await service.getMetrics('ext-123', 'TWITTER');
    expect(result).toHaveProperty('impressions');
    expect(result).toHaveProperty('engagements');
    expect(result).toHaveProperty('likes');
  });

  it('should validate platform credentials', async () => {
    const result = await service.validate('TWITTER', { token: 'test' });
    expect(result).toHaveProperty('valid', true);
  });
});
