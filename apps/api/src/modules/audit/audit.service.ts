import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface CreateAuditDto {
  action: string;
  userId: string;
  entityType: string;
  entityId?: string;
  metadata?: any;
  ipAddress?: string;
}

export interface ListAuditDto {
  skip?: number;
  take?: number;
  action?: string;
  userId?: string;
  entityType?: string;
  entityId?: string;
  startDate?: Date;
  endDate?: Date;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(dto: CreateAuditDto) {
    try {
      const auditLog = await this.prisma.auditLog.create({
        data: {
          action: dto.action,
          userId: dto.userId,
          entityType: dto.entityType,
          entityId: dto.entityId,
          metadata: dto.metadata ?? undefined,
          ipAddress: dto.ipAddress || undefined,
        },
      });

      this.logger.debug(
        `Audit: ${dto.action} | entity:${dto.entityType}:${dto.entityId} | user:${dto.userId}`,
      );

      return auditLog;
    } catch (error) {
      this.logger.error(`Failed to create audit log: ${error.message}`);
      return null;
    }
  }

  async findAll(dto: ListAuditDto = {}) {
    const where: any = {};

    if (dto.action) where.action = dto.action;
    if (dto.userId) where.userId = dto.userId;
    if (dto.entityType) where.entityType = dto.entityType;
    if (dto.entityId) where.entityId = dto.entityId;
    if (dto.startDate || dto.endDate) {
      where.createdAt = {} as any;
      if (dto.startDate) (where.createdAt as any).gte = dto.startDate;
      if (dto.endDate) (where.createdAt as any).lte = dto.endDate;
    }

    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip: dto.skip ?? 0,
        take: dto.take ?? 20,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      items,
      total,
      skip: dto.skip ?? 0,
      take: dto.take ?? 20,
    };
  }

  async findByResource(entityType: string, entityId: string) {
    const logs = await this.prisma.auditLog.findMany({
      where: { entityType, entityId },
      orderBy: { createdAt: 'desc' },
    });

    return { entityType, entityId, logs };
  }

  async findByUser(userId: string, limit = 50) {
    return this.prisma.auditLog.findMany({
      where: { userId },
      take: limit,
      orderBy: { createdAt: 'desc' },
    });
  }

  async cleanup(retentionDays = 180) {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const result = await this.prisma.auditLog.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    this.logger.log(`Cleaned up ${result.count} audit logs older than ${retentionDays} days`);
    return { deleted: result.count };
  }
}
