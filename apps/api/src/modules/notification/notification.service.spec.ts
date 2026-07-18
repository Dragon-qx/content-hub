import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { NotificationService } from './notification.service';
import { PrismaService } from '../../common/prisma/prisma.service';

const mockPrisma = () => ({
  notification: {
    create: jest.fn(),
    createMany: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    updateMany: jest.fn(),
  },
  member: { findMany: jest.fn().mockResolvedValue([]) },
  team: { findUnique: jest.fn().mockResolvedValue(null) },
  user: { findUnique: jest.fn().mockResolvedValue({ email: 'user@example.com' }) },
});

const mockConfig = () => ({
  get: jest.fn((key: string, fallback?: string) => {
    if (key === 'SMTP_HOST') return null;
    if (key === 'SMTP_FROM') return 'ContentHub <no-reply@contenthub.dev>';
    return fallback;
  }),
});

describe('NotificationService', () => {
  let service: NotificationService;
  let prisma: ReturnType<typeof mockPrisma>;

  beforeEach(async () => {
    prisma = mockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: mockConfig() },
      ],
    }).compile();

    service = module.get(NotificationService);
  });

  it('creates a single in-app notification', async () => {
    prisma.notification.create.mockResolvedValue({ id: 'n1' });
    const result = await service.create({
      userId: 'u1',
      title: 'Hello',
      body: 'Welcome',
    });
    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'u1', channel: 'in_app', type: 'info' }),
      }),
    );
    expect(result.id).toBe('n1');
  });

  it('fan-outs a broadcast to all team members', async () => {
    prisma.member.findMany.mockResolvedValue([{ userId: 'a' }, { userId: 'b' }]);
    prisma.team.findUnique.mockResolvedValue({ ownerId: 'owner' });
    prisma.notification.createMany.mockResolvedValue({ count: 3 });

    const result = await service.broadcastToTeam('team-1', {
      title: 'Heads up',
      body: 'New content published',
    });

    expect(prisma.notification.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ userId: 'owner' }),
          expect.objectContaining({ userId: 'a' }),
          expect.objectContaining({ userId: 'b' }),
        ]),
      }),
    );
    expect(result.count).toBe(3);
  });

  it('lists for a user with an unread count', async () => {
    prisma.notification.findMany.mockResolvedValue([{ id: 'n1' }]);
    prisma.notification.count.mockResolvedValueOnce(1).mockResolvedValueOnce(4);

    const result = await service.listForUser('u1', { unreadOnly: true });

    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.unreadCount).toBe(4);
    expect(prisma.notification.findMany.mock.calls[0][0]).toMatchObject({
      where: { userId: 'u1', read: false },
    });
  });

  it('email channel: record is created even when SMTP is not configured (best-effort)', async () => {
    prisma.notification.create.mockResolvedValue({ id: 'n-email', channel: 'email' });
    const result = await service.create({
      userId: 'u1',
      channel: 'email',
      title: 'Your weekly report',
      body: 'Your content performed well',
    });
    expect(result.channel).toBe('email');
    // SMTP not configured in this test → delivery silently skipped, no throw.
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('webhook channel: record is created (delivery is best-effort)', async () => {
    prisma.notification.create.mockResolvedValue({ id: 'n-wh', channel: 'webhook' });
    const result = await service.create({
      userId: 'u1',
      channel: 'webhook',
      webhookUrl: 'https://example.com/hook',
      title: 'Alert',
      body: 'Something happened',
    });
    expect(result.channel).toBe('webhook');
  });
});
