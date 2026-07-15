import { Test } from '@nestjs/testing';
import { AuditService, CreateAuditDto, ListAuditDto } from './audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';

describe('AuditService', () => {
  let service: AuditService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      auditLog: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        deleteMany: jest.fn(),
      },
    };

    const module = await Test.createTestingModule({
      providers: [AuditService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(AuditService);
    jest.clearAllMocks();
  });

  describe('log', () => {
    it('should create audit log entry', async () => {
      const dto: CreateAuditDto = {
        action: 'ACTION',
        userId: 'u1',
        entityType: 'Content',
        entityId: 'c1',
        metadata: { field: 'value' },
      };
      prisma.auditLog.create.mockResolvedValue({ id: 'log-1', ...dto });

      const result = await service.log(dto);
      expect(result).toHaveProperty('id', 'log-1');
      expect(result).toHaveProperty('action', 'ACTION');
    });

    it('should not throw on failure', async () => {
      prisma.auditLog.create.mockRejectedValue(new Error('DB error'));

      // Should not throw, just log and return null
      const result = await service.log({ action: 'test', userId: 'u', entityType: 't' });
      expect(result).toBeNull();
    });
  });

  describe('findAll', () => {
    it('should return paginated audit logs', async () => {
      prisma.auditLog.findMany.mockResolvedValue([{ id: 'log-1' }]);
      prisma.auditLog.count.mockResolvedValue(1);

      const result = await service.findAll({ skip: 0, take: 10 });
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });

  describe('findByResource', () => {
    it('should filter by entity type and id', async () => {
      prisma.auditLog.findMany.mockResolvedValue([{ id: 'log-1' }]);

      const result = await service.findByResource('Content', 'c1');
      expect(result).toHaveProperty('entityType', 'Content');
      expect(result).toHaveProperty('entityId', 'c1');
      expect(result.logs).toHaveLength(1);
    });
  });

  describe('cleanup', () => {
    it('should delete logs older than retention period', async () => {
      prisma.auditLog.deleteMany.mockResolvedValue({ count: 42 });

      const result = await service.cleanup(180);
      expect(result.deleted).toBe(42);
    });
  });
});

export {};
