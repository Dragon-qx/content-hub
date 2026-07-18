import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { Transporter, createTransport } from 'nodemailer';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface CreateNotificationDto {
  userId: string;
  type?: 'info' | 'success' | 'warning' | 'error';
  channel?: 'in_app' | 'email' | 'webhook';
  title: string;
  body: string;
  link?: string;
  /** Email recipient override (defaults to user.email). */
  email?: string;
  /** Webhook URL (defaults to config WEBHOOK_URL). */
  webhookUrl?: string;
  /** Channel-specific metadata forwarded to the transporter. */
  metadata?: Prisma.InputJsonValue;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private readonly smtpTransporter?: Transporter;
  private readonly defaultWebhookUrl?: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    const smtpHost = config.get('SMTP_HOST');
    const smtpUser = config.get('SMTP_USER');
    if (smtpHost && smtpUser) {
      this.smtpTransporter = createTransport({
        host: smtpHost,
        port: parseInt(config.get('SMTP_PORT', '587')),
        secure: config.get('SMTP_SECURE', 'false') === 'true',
        auth: {
          user: smtpUser,
          pass: config.get('SMTP_PASSWORD', ''),
        },
      });
      this.logger.log('SMTP transporter initialised');
    }
    this.defaultWebhookUrl = config.get('WEBHOOK_URL');
  }

  /** Create a single notification for one user. */
  async create(dto: CreateNotificationDto) {
    const created = await this.prisma.notification.create({
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

    // Best-effort async delivery to the chosen channel; never blocks the
    // database write or throws into the caller.
    if (created.channel === 'email') {
      this.deliverEmail(created.id, dto).catch((e) =>
        this.logger.warn(`email delivery failed for ${created.id}: ${e.message}`),
      );
    } else if (created.channel === 'webhook') {
      this.deliverWebhook(created.id, dto).catch((e) =>
        this.logger.warn(`webhook delivery failed for ${created.id}: ${e.message}`),
      );
    }

    return created;
  }

  /** Deliver an email notification via SMTP with graceful degradation. */
  private async deliverEmail(id: string, dto: CreateNotificationDto): Promise<void> {
    if (!this.smtpTransporter) {
      this.logger.warn(`[${id}] SMTP not configured — skipping email delivery`);
      return;
    }
    const to = dto.email || (await this.lookupUserEmail(dto.userId));
    if (!to) {
      this.logger.warn(`[${id}] No email recipient resolved — skipping`);
      return;
    }
    const from = this.config.get('SMTP_FROM', 'ContentHub <no-reply@contenthub.dev>');
    await this.smtpTransporter.sendMail({
      from,
      to,
      subject: dto.title,
      text: dto.body,
      html: `<p>${dto.body.replace(/\n/g, '<br/>')}</p>${dto.link ? `<p><a href="${dto.link}">${dto.link}</a></p>` : ''}`,
    });
  }

  /** Dispatch a webhook notification with best-effort retry. */
  private async deliverWebhook(id: string, dto: CreateNotificationDto): Promise<void> {
    const url = dto.webhookUrl || this.defaultWebhookUrl;
    if (!url) {
      this.logger.warn(`[${id}] No webhook URL configured — skipping delivery`);
      return;
    }

    const payload = {
      notificationId: id,
      userId: dto.userId,
      type: dto.type ?? 'info',
      title: dto.title,
      body: dto.body,
      link: dto.link,
      timestamp: new Date().toISOString(),
    };

    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.ok) return;
        this.logger.warn(`[${id}] webhook attempt ${attempt} → HTTP ${res.status}`);
      } catch (err) {
        this.logger.warn(`[${id}] webhook attempt ${attempt} failed: ${err.message}`);
      }
      await new Promise((r) => setTimeout(r, 1000 * 2 ** (attempt - 1)));
    }
  }

  private async lookupUserEmail(userId: string): Promise<string | undefined> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    return user?.email;
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
