import { Test, TestingModule } from '@nestjs/testing';
import { ReceiptController } from './receipt.controller';
import { PublishReceiptService } from './receipt.service';

describe('ReceiptController', () => {
  let controller: ReceiptController;
  let service: {
    generate: jest.Mock;
    listByContent: jest.Mock;
    get: jest.Mock;
    verify: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      generate: jest.fn().mockResolvedValue({}),
      listByContent: jest.fn().mockResolvedValue([]),
      get: jest.fn().mockResolvedValue({}),
      verify: jest.fn().mockResolvedValue({ id: 'r1', valid: true }),
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReceiptController],
      providers: [{ provide: PublishReceiptService, useValue: service }],
    }).compile();
    controller = module.get(ReceiptController);
  });

  it('generate forwards DTO to service.generate', async () => {
    const dto = { contentId: 'c1', platform: 'WECHAT_OFFICIAL' as any } as any;
    await controller.generate(dto);
    expect(service.generate).toHaveBeenCalledWith(dto);
  });

  it('list forwards contentId query', async () => {
    await controller.list({ contentId: 'c1' } as any);
    expect(service.listByContent).toHaveBeenCalledWith('c1');
  });

  it('get forwards the id', async () => {
    await controller.get('r1');
    expect(service.get).toHaveBeenCalledWith('r1');
  });

  it('verify forwards the id', async () => {
    const out: any = await controller.verify('r1');
    expect(service.verify).toHaveBeenCalledWith('r1');
    expect(out.valid).toBe(true);
  });
});
