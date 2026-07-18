import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Platform, Prisma } from '@prisma/client';
import {
  NoopScreenshotProvider,
  PublishReceiptService,
  ScreenshotProvider,
} from './receipt.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MediaService } from '../media/media.service';

const mockPrisma = () => ({
  publishReceipt: {
    findUnique: jest.fn(),
    create: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
  },
  mediaAsset: {
    create: jest.fn(),
  },
});

describe('PublishReceiptService', () => {
  let service: PublishReceiptService;
  let prisma: ReturnType<typeof mockPrisma>;
  let media: {
    buildReceiptCard: jest.Mock;
    attachReceiptCard: jest.Mock;
  };
  let screenshot: jest.Mocked<ScreenshotProvider>;

  beforeEach(async () => {
    prisma = mockPrisma();
    media = {
      buildReceiptCard: jest
        .fn()
        .mockResolvedValue({ buffer: Buffer.from('fake-png'), width: 100, height: 80 }),
      attachReceiptCard: jest
        .fn()
        .mockResolvedValue({ id: 'asset-1', url: '/uploads/receipts/asset-1.png' }),
    };
    screenshot = { capture: jest.fn().mockResolvedValue({ captured: false }) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PublishReceiptService,
        { provide: PrismaService, useValue: prisma },
        { provide: MediaService, useValue: media },
        { provide: ScreenshotProvider, useValue: screenshot },
      ],
    }).compile();
    service = module.get(PublishReceiptService);
  });

  describe('receiptHashFor', () => {
    it('produces a deterministic 64-hex hash', () => {
      const a = service.receiptHashFor({
        contentId: 'c1',
        platform: Platform.WECHAT_OFFICIAL,
        externalId: 'ext',
      });
      const b = service.receiptHashFor({
        contentId: 'c1',
        platform: Platform.WECHAT_OFFICIAL,
        externalId: 'ext',
      });
      expect(a).toBe(b);
      expect(a).toMatch(/^[0-9a-f]{64}$/);
    });

    it('differs when any component differs', () => {
      const a = service.receiptHashFor({
        contentId: 'c1',
        platform: Platform.WECHAT_OFFICIAL,
      });
      const b = service.receiptHashFor({
        contentId: 'c1',
        platform: Platform.DOUYIN,
      });
      expect(a).not.toBe(b);
    });
  });

  describe('generate', () => {
    it('rejects when required fields are missing', async () => {
      await expect(
        service.generate({ contentId: '', platform: Platform.WECHAT_OFFICIAL }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('returns the existing receipt when idempotent (default)', async () => {
      prisma.publishReceipt.findUnique.mockResolvedValue({ id: 'r1' } as any);
      const res = await service.generate({
        contentId: 'c1',
        platform: Platform.WECHAT_OFFICIAL,
      });
      expect(res.receipt.id).toBe('r1');
      expect(media.buildReceiptCard).not.toHaveBeenCalled();
    });

    it('throws Conflict on the second generate with idempotent=false', async () => {
      prisma.publishReceipt.findUnique.mockResolvedValue({ id: 'r1' } as any);
      await expect(
        service.generate({
          contentId: 'c1',
          platform: Platform.WECHAT_OFFICIAL,
          idempotent: false,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('calls screenshot provider and falls back to a card image', async () => {
      prisma.publishReceipt.findUnique.mockResolvedValue(null);
      prisma.publishReceipt.create.mockResolvedValue({ id: 'r-new' } as any);

      const res = await service.generate({
        contentId: 'c1',
        platform: Platform.DOUYIN,
        externalId: 'ext-x',
        externalUrl: 'https://p.douyin.com/post/x',
      });

      expect(screenshot.capture).toHaveBeenCalledWith(
        'https://p.douyin.com/post/x',
        expect.objectContaining({ contentId: 'c1', platform: Platform.DOUYIN, externalId: 'ext-x' }),
      );
      expect(media.buildReceiptCard).toHaveBeenCalled();
      expect(media.attachReceiptCard).toHaveBeenCalled();
      expect(prisma.publishReceipt.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            contentId: 'c1',
            platform: Platform.DOUYIN,
            externalId: 'ext-x',
            assetId: 'asset-1',
          }),
        }),
      );
      expect(res.receipt.id).toBe('r-new');
      void Prisma;
    });

    it('still succeeds if screenshot capture throws', async () => {
      prisma.publishReceipt.findUnique.mockResolvedValue(null);
      prisma.publishReceipt.create.mockResolvedValue({ id: 'r2' } as any);
      screenshot.capture.mockRejectedValue(new Error('browser missing'));

      const res = await service.generate({
        contentId: 'c1',
        platform: Platform.BILIBILI,
        externalUrl: 'https://bilibili.com/x',
      });
      expect(res.screenshotCaptured).toBe(false);
      expect(res.receipt.id).toBe('r2');
    });
  });

  describe('list/get/verify', () => {
    it('listByContent queries by contentId', async () => {
      await service.listByContent('c1');
      expect(prisma.publishReceipt.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { contentId: 'c1' } }),
      );
    });

    it('get throws NotFound for a missing receipt', async () => {
      prisma.publishReceipt.findUnique.mockResolvedValue(null);
      await expect(service.get('none')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('verify reports valid=true when the hash matches', async () => {
      const hash = service.receiptHashFor({
        contentId: 'c1',
        platform: Platform.TWITTER,
        externalId: 'tw',
      });
      prisma.publishReceipt.findUnique.mockResolvedValue({
        id: 'r1',
        contentId: 'c1',
        platform: Platform.TWITTER,
        externalId: 'tw',
        receiptHash: hash,
      } as any);

      const res = await service.verify('r1');
      expect(res.id).toBe('r1');
      expect(res.valid).toBe(true);
    });

    it('verify reports valid=false when the stored hash is tampered', async () => {
      prisma.publishReceipt.findUnique.mockResolvedValue({
        id: 'r1',
        contentId: 'c1',
        platform: Platform.TWITTER,
        externalId: 'tw',
        receiptHash: 'deadbeef',
      } as any);
      const res = await service.verify('r1');
      expect(res.valid).toBe(false);
    });
  });
});
