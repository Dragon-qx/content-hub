import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { MediaService } from './media.service';
import { PrismaService } from '../../common/prisma/prisma.service';

describe('MediaService', () => {
  let service: MediaService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      mediaAsset: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
        delete: jest.fn(),
      },
    };

    const module = await Test.createTestingModule({
      providers: [
        MediaService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(MediaService);
    jest.clearAllMocks();
  });

  describe('upload', () => {
    it('maps a video mimetype to the VIDEO media type', async () => {
      prisma.mediaAsset.create.mockResolvedValue({ id: 'm1' });
      const result = await service.upload(
        { filename: 'clip.mp4', mimetype: 'video/mp4', size: 1024 },
        'c1',
      );
      expect(prisma.mediaAsset.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: 'VIDEO', contentId: 'c1' }),
        }),
      );
      expect(result.id).toBe('m1');
    });

    it('defaults unknown mimetypes to IMAGE', async () => {
      prisma.mediaAsset.create.mockResolvedValue({ id: 'm2' });
      await service.upload({ filename: 'x.xyz', mimetype: 'application/x-foo' });
      const arg = prisma.mediaAsset.create.mock.calls[0][0];
      expect(arg.data.type).toBe('IMAGE');
    });
  });

  describe('findAll', () => {
    it('paginates and filters by contentId and type', async () => {
      prisma.mediaAsset.findMany.mockResolvedValue([]);
      prisma.mediaAsset.count.mockResolvedValue(0);
      const result = await service.findAll({ contentId: 'c1', type: 'document' });
      expect(result).toEqual({ items: [], total: 0, skip: 0, take: 20 });
      const arg = prisma.mediaAsset.findMany.mock.calls[0][0];
      expect(arg.where).toEqual({ contentId: 'c1', type: 'AUDIO' });
    });
  });

  describe('findOne', () => {
    it('returns the asset when it exists', async () => {
      prisma.mediaAsset.findUnique.mockResolvedValue({ id: 'm1' });
      expect(await service.findOne('m1')).toEqual({ id: 'm1' });
    });

    it('throws NotFound when missing', async () => {
      prisma.mediaAsset.findUnique.mockResolvedValue(null);
      await expect(service.findOne('ghost')).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('deletes the asset', async () => {
      prisma.mediaAsset.findUnique.mockResolvedValue({ id: 'm1' });
      prisma.mediaAsset.delete.mockResolvedValue({ id: 'm1' });
      const result = await service.remove('m1');
      expect(result).toEqual({ success: true, id: 'm1' });
    });
  });
});
