import { Test } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { ContentStatus, JobStatus } from '@prisma/client';
import { ContentService, CONTENT_TRANSITIONS } from './content.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { WorkflowService } from '../workflow/workflow.service';
import { mockPrisma } from '../../../test/prisma.mock';

describe('ContentService', () => {
  let service: ContentService;
  let prisma: ReturnType<typeof mockPrisma>;
  let workflow: WorkflowService;

  beforeEach(async () => {
    prisma = mockPrisma();
    workflow = new WorkflowService(prisma as unknown as PrismaService);

    const module = await Test.createTestingModule({
      providers: [
        ContentService,
        { provide: PrismaService, useValue: prisma },
        { provide: WorkflowService, useValue: workflow },
      ],
    }).compile();

    service = module.get(ContentService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create content with version tracking', async () => {
      const dto = {
        title: 'Test',
        body: 'Body',
        tags: ['a', 'b'],
        teamId: 'team-1',
      };
      prisma.content.create.mockResolvedValue({ id: '1', ...dto, version: 1 });

      const result = await service.create(dto, 'user-1');

      expect(result).toHaveProperty('id', '1');
      expect(result).toHaveProperty('version', 1);
      expect(prisma.content.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: 'Test',
            createdBy: 'user-1',
            version: 1,
          }),
        }),
      );
    });

    it('rejects create without teamId', async () => {
      await expect(
        service.create({ title: 'No team', teamId: '' }, 'u1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findAll', () => {
    it('should return paginated results', async () => {
      prisma.content.findMany.mockResolvedValue([{ id: '1' }]);
      prisma.content.count.mockResolvedValue(1);

      const result = await service.findAll({ skip: 0, take: 10 });

      expect(result).toHaveProperty('items');
      expect(result).toHaveProperty('total');
      expect(result.items).toHaveLength(1);
    });
  });

  describe('findOne', () => {
    it('should return content with relations', async () => {
      const content = { id: '1', title: 'Test', tags: [], versions: [] };
      prisma.content.findUnique.mockResolvedValue(content);

      const result = await service.findOne('1');
      expect(result).toEqual(content);
    });

    it('should throw NotFoundException for missing content', async () => {
      prisma.content.findUnique.mockResolvedValue(null);
      await expect(service.findOne('999')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update content fields', async () => {
      prisma.content.findUnique.mockResolvedValue({ id: '1' });
      prisma.content.update.mockResolvedValue({ id: '1', title: 'Updated' });

      const result = await service.update('1', { title: 'Updated' });
      expect(result.title).toBe('Updated');
    });

    it('rejects an illegal status transition', async () => {
      prisma.content.findUnique.mockResolvedValue({
        id: '1',
        status: ContentStatus.DRAFT,
      });
      await expect(
        service.update('1', { status: ContentStatus.PUBLISHED }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('createVersion', () => {
    it('creates a new version and bumps the counter', async () => {
      prisma.content.findUnique.mockResolvedValue({ id: '1', version: 1, title: 'T' });
      prisma.$transaction.mockResolvedValue([
        { id: '1', version: 2 },
        { id: 'v2' },
      ]);

      const result = await service.createVersion('1', { title: 'T2' }, 'user-1');
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(result[1]).toHaveProperty('id', 'v2');
    });
  });

  describe('remove', () => {
    it('should delete content', async () => {
      prisma.content.findUnique.mockResolvedValue({ id: '1' });
      prisma.content.delete.mockResolvedValue({ id: '1' });

      const result = await service.remove('1');
      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('id', '1');
    });
  });

  describe('calendar', () => {
    it('builds a full month grid with content + job events grouped by day', async () => {
      const jul6 = new Date(Date.UTC(2026, 6, 6, 10, 0, 0));
      const jul7 = new Date(Date.UTC(2026, 6, 7, 12, 0, 0));
      // First content.findMany → scheduled content; second (job title lookup) → c2.
      prisma.content.findMany
        .mockResolvedValueOnce([
          { id: 'c1', title: 'Scheduled post', status: ContentStatus.SCHEDULED, scheduledAt: jul6 },
        ])
        .mockResolvedValueOnce([{ id: 'c2', title: 'Queued job content' }]);
      prisma.publishJob.findMany.mockResolvedValue([
        {
          id: 'j1',
          contentId: 'c2',
          platform: 'DOUYIN',
          status: JobStatus.QUEUED,
          scheduledAt: jul7,
        },
      ]);

      const result = await service.calendar(2026, 7);

      expect(result.year).toBe(2026);
      expect(result.month).toBe(7);
      expect(result.days).toHaveLength(31);
      // Content lands on the 6th, job on the 7th (dates are UTC-grouped).
      expect(result.days[5]).toHaveProperty('date', '2026-07-06');
      expect(result.days[5].events).toHaveLength(1);
      expect(result.days[5].events[0]).toMatchObject({
        id: 'c1',
        type: 'content',
        status: ContentStatus.SCHEDULED,
      });
      expect(result.days[6]).toHaveProperty('date', '2026-07-07');
      expect(result.days[6].events[0]).toMatchObject({
        id: 'j1',
        type: 'job',
        platform: 'DOUYIN',
        title: 'Queued job content',
      });
      // A quiet day has no events.
      expect(result.days[0].events).toHaveLength(0);
    });

    it('queries only the target month window (SCHEDULED/PUBLISHING + QUEUED/RETRYING)', async () => {
      prisma.content.findMany.mockResolvedValue([]);
      prisma.publishJob.findMany.mockResolvedValue([]);

      await service.calendar(2026, 7);

      // First content.findMany is the scheduled-content query.
      expect(prisma.content.findMany).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          where: {
            status: { in: [ContentStatus.SCHEDULED, ContentStatus.PUBLISHING] },
            scheduledAt: {
              gte: new Date(Date.UTC(2026, 6, 1, 0, 0, 0)),
              lt: new Date(Date.UTC(2026, 7, 1, 0, 0, 0)),
            },
          },
        }),
      );
      expect(prisma.publishJob.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            status: { in: [JobStatus.QUEUED, JobStatus.RETRYING] },
            scheduledAt: {
              gte: new Date(Date.UTC(2026, 6, 1, 0, 0, 0)),
              lt: new Date(Date.UTC(2026, 7, 1, 0, 0, 0)),
            },
          },
        }),
      );
    });

    it('February in a leap year has 29 days', async () => {
      // content.findMany: scheduled-content query then the (empty) title lookup.
      prisma.content.findMany.mockResolvedValue([]);
      prisma.publishJob.findMany.mockResolvedValue([]);
      const result = await service.calendar(2024, 2);
      expect(result.days).toHaveLength(29);
      expect(result.days[28]).toHaveProperty('date', '2024-02-29');
    });
  });

  describe('status state machine', () => {
    it('exposes allowed transitions for every state', () => {
      expect(CONTENT_TRANSITIONS[ContentStatus.DRAFT]).toEqual([
        ContentStatus.IN_REVIEW,
        ContentStatus.ARCHIVED,
      ]);
      // terminal states allow nothing
      expect(CONTENT_TRANSITIONS[ContentStatus.ARCHIVED]).toEqual([]);
    });

    it('canTransition reflects the map', () => {
      expect(service.canTransition(ContentStatus.DRAFT, ContentStatus.IN_REVIEW)).toBe(true);
      expect(service.canTransition(ContentStatus.DRAFT, ContentStatus.PUBLISHED)).toBe(false);
    });

    it('treats same-status as an idempotent no-op', () => {
      expect(() =>
        service.assertTransition(ContentStatus.DRAFT, ContentStatus.DRAFT),
      ).not.toThrow();
    });

    it('throws on an illegal transition via assertTransition', () => {
      expect(() =>
        service.assertTransition(ContentStatus.ARCHIVED, ContentStatus.DRAFT),
      ).toThrow(BadRequestException);
    });

    it('submitForReview moves DRAFT → IN_REVIEW and opens a workflow', async () => {
      prisma.content.findUnique.mockResolvedValue({
        id: '1',
        title: 'T',
        status: ContentStatus.DRAFT,
        teamId: 'team-1',
        createdBy: 'author-1',
      });
      prisma.team.findUnique.mockResolvedValue({
        id: 'team-1',
        ownerId: 'admin-1',
        members: [{ userId: 'admin-1', role: 'ADMIN' }],
      });
      // No existing pending flow, so the new approval flow is created.
      prisma.workflow.findFirst.mockResolvedValue(null);
      // createApprovalFlow validates the approver user exists.
      prisma.user.findUnique.mockResolvedValue({ id: 'admin-1' });
      prisma.workflow.create.mockResolvedValue({ id: 'w1' });
      prisma.content.update.mockResolvedValue({ id: '1', status: ContentStatus.IN_REVIEW });

      const result = await service.submitForReview('1', 'author-1');

      expect(prisma.workflow.create).toHaveBeenCalled();
      expect(prisma.content.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: ContentStatus.IN_REVIEW },
        }),
      );
      expect(result).toHaveProperty('status', ContentStatus.IN_REVIEW);
    });

    it('submitForReview rejects non-draft content', async () => {
      prisma.content.findUnique.mockResolvedValue({
        id: '1',
        status: ContentStatus.APPROVED,
      });
      await expect(service.submitForReview('1', 'author-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('approveContent moves IN_REVIEW → APPROVED and closes the workflow', async () => {
      prisma.content.findUnique.mockResolvedValue({
        id: '1',
        status: ContentStatus.IN_REVIEW,
      });
      // findPendingForContent locates the flow; assertPending re-reads via findUnique.
      prisma.workflow.findFirst.mockResolvedValue({ id: 'w1' });
      prisma.workflow.findUnique.mockResolvedValue({ id: 'w1', status: 'PENDING' });
      prisma.workflow.update.mockResolvedValue({ id: 'w1', status: 'APPROVED' });
      prisma.content.update.mockResolvedValue({ id: '1', status: ContentStatus.APPROVED });

      const result = await service.approveContent('1', 'admin-1', 'Looks good');

      expect(prisma.workflow.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'APPROVED' }),
        }),
      );
      expect(result).toHaveProperty('status', ContentStatus.APPROVED);
    });

    it('rejectContent moves IN_REVIEW → DRAFT and rejects the workflow', async () => {
      prisma.content.findUnique.mockResolvedValue({
        id: '1',
        status: ContentStatus.IN_REVIEW,
      });
      prisma.workflow.findFirst.mockResolvedValue({ id: 'w1' });
      prisma.workflow.findUnique.mockResolvedValue({ id: 'w1', status: 'PENDING' });
      prisma.workflow.update.mockResolvedValue({ id: 'w1', status: 'REJECTED' });
      prisma.content.update.mockResolvedValue({ id: '1', status: ContentStatus.DRAFT });

      const result = await service.rejectContent('1', 'admin-1', 'Needs edits');

      expect(prisma.workflow.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'REJECTED' }),
        }),
      );
      expect(result).toHaveProperty('status', ContentStatus.DRAFT);
    });

    it('archive moves a published item → ARCHIVED', async () => {
      prisma.content.findUnique.mockResolvedValue({
        id: '1',
        status: ContentStatus.PUBLISHED,
      });
      prisma.content.update.mockResolvedValue({ id: '1', status: ContentStatus.ARCHIVED });

      const result = await service.archive('1', 'author-1');
      expect(result).toHaveProperty('status', ContentStatus.ARCHIVED);
    });

    it('archive rejects an in-flight item', async () => {
      prisma.content.findUnique.mockResolvedValue({
        id: '1',
        status: ContentStatus.PUBLISHING,
      });
      await expect(service.archive('1', 'author-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
