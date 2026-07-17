import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AuditService } from './audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';

const mockPrisma = () => ({
  user: { findUnique: jest.fn(), findMany: jest.fn() },
  auditLog: {
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
  $transaction: jest.fn(),
});

describe('AuditService', () => {
  let service: AuditService;
  let prisma: ReturnType<typeof mockPrisma>;

  beforeEach(async () => {
    prisma = mockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(AuditService);
  });

  const user = { id: 'user-1' };
  const entry = {
    id: 'audit-1',
    userId: 'user-1',
    action: 'content.update',
    entityType: 'content',
    entityId: 'content-1',
    metadata: { title: 'new' },
    ipAddress: '127.0.0.1',
    createdAt: new Date('2026-01-01'),
  };

  describe('log', () => {
    it('persists a log translating resource* fields to entity* columns', async () => {
      prisma.user.findUnique.mockResolvedValue(user);
      prisma.auditLog.create.mockResolvedValue(entry);

      const result = await service.log(
        'content.update',
        'user-1',
        'content',
        'content-1',
        { title: 'new' },
        '127.0.0.1',
      );

      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'content.update',
            entityType: 'content',
            entityId: 'content-1',
            metadata: { title: 'new' },
            ipAddress: '127.0.0.1',
          }),
        }),
      );
      expect(result).toEqual(entry);
    });

    it('stores JSON null when no details are provided', async () => {
      prisma.user.findUnique.mockResolvedValue(user);
      prisma.auditLog.create.mockResolvedValue({ ...entry, metadata: null });

      await service.log('content.read', 'user-1', 'content', 'content-1');

      const call = prisma.auditLog.create.mock.calls[0][0];
      expect(call.data.metadata).toBeDefined();
    });

    it('throws NotFound when the acting user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.log('content.read', 'ghost', 'content', 'content-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('passes filters into the where clause and paginates via $transaction', async () => {
      prisma.$transaction.mockResolvedValue([[entry], 1]);

      const result = await service.findAll({
        userId: 'user-1',
        action: 'content.update',
      });

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(result.total).toBe(1);
      expect(result.items).toEqual([entry]);
    });

    it('adds a createdAt range when from/to are supplied', async () => {
      prisma.$transaction.mockResolvedValue([[], 0]);

      await service.findAll({ from: '2026-01-01', to: '2026-02-01' });

      const { where } = prisma.auditLog.findMany.mock.calls[0][0];
      expect(where.createdAt).toEqual({
        gte: new Date('2026-01-01'),
        lte: new Date('2026-02-01'),
      });
    });

    it('resolves operator free-text to user ids via name/email search', async () => {
      prisma.user.findMany.mockResolvedValue([{ id: 'user-1' }]);
      prisma.$transaction.mockResolvedValue([[], 0]);

      await service.findAll({ operator: '小林' });

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [
              { name: { contains: '小林', mode: 'insensitive' } },
              { email: { contains: '小林', mode: 'insensitive' } },
            ],
          },
        }),
      );
      const { where } = prisma.auditLog.findMany.mock.calls[0][0];
      expect(where.userId).toEqual({ in: ['user-1'] });
    });

    it('matches nothing when no user matches the operator term', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.$transaction.mockResolvedValue([[], 0]);

      const result = await service.findAll({ operator: 'ghost' });

      const { where } = prisma.auditLog.findMany.mock.calls[0][0];
      expect(where.userId).toEqual({ equals: '__never__' });
      expect(result.total).toBe(0);
    });
  });

  describe('exportAll', () => {
    it('returns all matching logs without pagination, honoring the cap', async () => {
      prisma.$transaction?.mockResolvedValue([]);
      prisma.auditLog.findMany.mockResolvedValue([entry, entry]);

      const result = await service.exportAll({ action: 'CREATE' }, 500);

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 500,
          orderBy: { createdAt: 'desc' },
        }),
      );
      expect(result).toHaveLength(2);
    });
  });

  describe('findByResource', () => {
    it('returns logs for the given resource', async () => {
      prisma.auditLog.findMany.mockResolvedValue([entry]);

      const result = await service.findByResource('content', 'content-1');

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { entityType: 'content', entityId: 'content-1' },
        }),
      );
      expect(result).toEqual({
        resourceType: 'content',
        resourceId: 'content-1',
        logs: [entry],
      });
    });
  });
});
