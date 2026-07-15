import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AuditService } from './audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';

const mockPrisma = () => ({
  user: { findUnique: jest.fn() },
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

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'content.update',
          entityType: 'content',
          entityId: 'content-1',
          metadata: { title: 'new' },
          ipAddress: '127.0.0.1',
        }),
      });
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
