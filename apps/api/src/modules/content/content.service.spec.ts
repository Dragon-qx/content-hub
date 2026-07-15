import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ContentService } from './content.service';
import { PrismaService } from '../../common/prisma/prisma.service';

describe('ContentService', () => {
  let service: ContentService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      content: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      contentVersion: {
        create: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        ContentService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(ContentService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create content with version tracking', async () => {
      const dto = { title: 'Test', body: 'Body', tags: ['a', 'b'] };
      prisma.content.create.mockResolvedValue({ id: '1', ...dto, version: 1 });

      const result = await service.create(dto, 'user-1');

      expect(result).toHaveProperty('id', '1');
      expect(result).toHaveProperty('version', 1);
      expect(prisma.content.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          title: 'Test',
          createdBy: 'user-1',
          version: 1,
        }),
      }));
    });
  });

  describe('findAll', () => {
    it('should return paginated results', async () => {
      prisma.content.findMany.mockResolvedValue([{ id: '1' }]);
      prisma.content.count.mockResolvedValue(1);

      const result = await service.findAll({ skip: 0, take: 10 });

      expect(result).toHaveProperty('items');
      expect(result).toHaveProperty('total');
      expect(result.items).toHaveLength(1);
    });
  });

  describe('findOne', () => {
    it('should return content with relations', async () => {
      const content = { id: '1', title: 'Test', tags: [], versions: [] };
      prisma.content.findUnique.mockResolvedValue(content);

      const result = await service.findOne('1');
      expect(result).toEqual(content);
    });

    it('should throw NotFoundException for missing content', async () => {
      prisma.content.findUnique.mockResolvedValue(null);
      await expect(service.findOne('999')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update content fields', async () => {
      prisma.content.findUnique.mockResolvedValue({ id: '1' });
      prisma.content.update.mockResolvedValue({ id: '1', title: 'Updated' });

      const result = await service.update('1', { title: 'Updated' });
      expect(result.title).toBe('Updated');
    });
  });

  describe('remove', () => {
    it('should delete content', async () => {
      prisma.content.findUnique.mockResolvedValue({ id: '1' });
      prisma.content.delete.mockResolvedValue({ id: '1' });

      const result = await service.remove('1');
      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('id', '1');
    });
  });
});
