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
  user: { select: { id: true, name: true, email: true } },
} as const;

export type PublicAuditLog = Prisma.AuditLogGetPayload<{
  select: typeof PUBLIC_SELECT;
}>;

/** Parameters accepted by both {@link AuditService.findAll} and the CSV export. */
export interface AuditListParams {
  skip?: number;
  take?: number;
  userId?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  from?: string;
  to?: string;
  operator?: string;
}

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
    details?: Prisma.InputJsonValue | object | null,
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

  /** Build the Prisma `where` clause shared by the paged list and CSV export. */
  private async buildWhere(params: AuditListParams): Promise<Prisma.AuditLogWhereInput> {
    const where: Prisma.AuditLogWhereInput = {};
    if (params.userId) where.userId = params.userId;
    if (params.action) where.action = params.action;
    if (params.entityType) where.entityType = params.entityType;
    if (params.entityId) where.entityId = params.entityId;

    if (params.from || params.to) {
      where.createdAt = {};
      if (params.from) where.createdAt.gte = new Date(params.from);
      if (params.to) where.createdAt.lte = new Date(params.to);
    }

    // Free-text operator search: resolve users whose name/email matches, then
    // scope logs to those user ids. An empty match set yields no rows.
    if (params.operator) {
      const matches = await this.prisma.user.findMany({
        where: {
          OR: [
            { name: { contains: params.operator, mode: 'insensitive' } },
            { email: { contains: params.operator, mode: 'insensitive' } },
          ],
        },
        select: { id: true },
      });
      const userIds = matches.map((u) => u.id);
      where.userId = userIds.length ? { in: userIds } : { equals: '__never__' };
    }

    return where;
  }

  /** List audit logs with optional filters and pagination. */
  async findAll(
    params: AuditListParams = {},
  ): Promise<{ items: PublicAuditLog[]; total: number; skip: number; take: number }> {
    const where = await this.buildWhere(params);

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

  /**
   * Stream every log matching the filters (no pagination) for CSV export.
   * Capped to avoid unbounded responses.
   */
  async exportAll(params: AuditListParams = {}, cap = 10_000): Promise<PublicAuditLog[]> {
    const where = await this.buildWhere(params);
    return this.prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: cap,
      select: PUBLIC_SELECT,
    });
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
