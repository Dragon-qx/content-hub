import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface CreateNotificationDto {
  userId: string;
  type?: 'info' | 'success' | 'warning' | 'error';
  channel?: 'in_app' | 'email' | 'webhook';
  title: string;
  body: string;
  link?: string;
  metadata?: Prisma.InputJsonValue;
}

@Injectable()
export class NotificationService {
  constructor(private readonly prisma: PrismaService) {}

  /** Create a single notification for one user. */
  async create(dto: CreateNotificationDto) {
    return this.prisma.notification.create({
      data: {
        userId: dto.userId,
        type: dto.type ?? 'info',
        channel: dto.channel ?? 'in_app',
        title: dto.title,
        body: dto.body,
        link: dto.link,
        metadata: dto.metadata ?? Prisma.JsonNull,
      },
    });
  }

  /**
   * Fan out a notification to every member of a team. Duplicates are expected
   * (each row targets one user); callers that only care about delivery can
   * filter on channel.
   */
  async broadcastToTeam(
    teamId: string,
    dto: Omit<CreateNotificationDto, 'userId'>,
  ) {
    const memberships = await this.prisma.member.findMany({
      where: { teamId },
      select: { userId: true },
    });
    const owner = await this.prisma.team.findUnique({
      where: { id: teamId },
      select: { ownerId: true },
    });

    const userIds = new Set(memberships.map((m) => m.userId));
    if (owner) userIds.add(owner.ownerId);

    const rows = [...userIds].map((userId) => ({
      userId,
      type: dto.type ?? 'info',
      channel: dto.channel ?? 'in_app',
      title: dto.title,
      body: dto.body,
      link: dto.link,
      metadata: dto.metadata ?? Prisma.JsonNull,
    }));

    if (rows.length === 0) return { count: 0 };
    const result = await this.prisma.notification.createMany({ data: rows });
    return { count: result.count };
  }

  /** List notifications for a user with unread priority. */
  async listForUser(userId: string, params: { skip?: number; take?: number; unreadOnly?: boolean } = {}) {
    const where: Prisma.NotificationWhereInput = { userId };
    if (params.unreadOnly) {
      where.read = false;
    }

    const unreadWhere: Prisma.NotificationWhereInput = { userId, read: false };

    const [items, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        skip: params.skip ?? 0,
        take: params.take ?? 20,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: unreadWhere }),
    ]);

    return {
      items,
      total,
      unreadCount,
      skip: params.skip ?? 0,
      take: params.take ?? 20,
    };
  }

  async markRead(id: string, userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { id, userId },
      data: { read: true },
    });
    return { updated: result.count };
  }

  async markAllRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
    return { updated: result.count };
  }
}
