import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditLog, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

const PUBLIC_SELECT = {
  id: true,
  userId: true,
  action: true,
  entityType: true,
  entityId: true,
  metadata: true,
  ipAddress: true,
  createdAt: true,
} as const;

export type PublicAuditLog = Prisma.AuditLogGetPayload<{
  select: typeof PUBLIC_SELECT;
}>;

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Record an audit entry. Controller payloads name the fields
   * `resourceType` / `resourceId`; the schema stores them as
   * `entityType` / `entityId`, so we translate here.
   */
  async log(
    action: string,
    userId: string,
    resourceType: string,
    resourceId: string,
    details?: Prisma.InputJsonValue,
    ipAddress?: string,
  ): Promise<PublicAuditLog> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }

    return this.prisma.auditLog.create({
      data: {
        action,
        user: { connect: { id: userId } },
        entityType: resourceType,
        entityId: resourceId,
        metadata: details ?? Prisma.JsonNull,
        ipAddress: ipAddress ?? null,
      },
      select: PUBLIC_SELECT,
    });
  }

  /** List audit logs with optional filters and pagination. */
  async findAll(
    params: {
      skip?: number;
      take?: number;
      userId?: string;
      action?: string;
      entityType?: string;
      entityId?: string;
    } = {},
  ): Promise<{ items: PublicAuditLog[]; total: number; skip: number; take: number }> {
    const where: Prisma.AuditLogWhereInput = {};
    if (params.userId) where.userId = params.userId;
    if (params.action) where.action = params.action;
    if (params.entityType) where.entityType = params.entityType;
    if (params.entityId) where.entityId = params.entityId;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        skip: params.skip ?? 0,
        take: params.take ?? 20,
        orderBy: { createdAt: 'desc' },
        select: PUBLIC_SELECT,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { items, total, skip: params.skip ?? 0, take: params.take ?? 20 };
  }

  /** Fetch every audit log for a given resource. */
  async findByResource(
    resourceType: string,
    resourceId: string,
  ): Promise<{ resourceType: string; resourceId: string; logs: PublicAuditLog[] }> {
    const logs = await this.prisma.auditLog.findMany({
      where: { entityType: resourceType, entityId: resourceId },
      orderBy: { createdAt: 'desc' },
      select: PUBLIC_SELECT,
    });

    return { resourceType, resourceId, logs };
  }
}
