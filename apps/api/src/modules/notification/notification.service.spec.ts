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
});
