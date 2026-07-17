import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { UserService } from './user.service';
import { PrismaService } from '../../common/prisma/prisma.service';

describe('UserService', () => {
  let service: UserService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
    };

    const module = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(UserService);
    jest.clearAllMocks();
  });

  describe('findById', () => {
    it('should return a user without password fields', async () => {
      const user = { id: '1', email: 'a@b.com', name: 'Test' };
      prisma.user.findUnique.mockResolvedValue(user);

      const result = await service.findById('1');
      expect(result).toEqual(user);
      expect(result).not.toHaveProperty('passwordHash');
      expect(result).not.toHaveProperty('mfaSecret');
    });

    it('should throw NotFoundException for missing user', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.findById('999')).rejects.toThrow(NotFoundException);
    });
  });

  describe('list', () => {
    it('should return paginated users', async () => {
      prisma.user.findMany.mockResolvedValue([{ id: '1' }, { id: '2' }]);
      prisma.user.count.mockResolvedValue(2);

      const result = await service.list({ skip: 0, take: 10 });
      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
      );
    });

    it('should build a search filter across name and email', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      await service.list({ search: 'alice' });

      const arg = prisma.user.findMany.mock.calls[0][0];
      expect(arg.where.OR).toEqual(
        expect.arrayContaining([
          { name: { contains: 'alice', mode: 'insensitive' } },
          { email: { contains: 'alice', mode: 'insensitive' } },
        ]),
      );
    });
  });

  describe('update', () => {
    it('should update user data', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: '1' });
      prisma.user.update.mockResolvedValue({ id: '1', name: 'Updated' });

      const result = await service.update('1', { name: 'Updated' });
      expect(result.name).toBe('Updated');
    });

    it('should throw NotFoundException if user missing', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.update('999', { name: 'X' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should soft-delete user', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: '1' });
      prisma.user.update.mockResolvedValue({ id: '1', isActive: false });

      const result = await service.remove('1');
      expect(result.isActive).toBe(false);
    });
  });
});
