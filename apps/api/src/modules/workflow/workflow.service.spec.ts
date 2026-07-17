import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { WorkflowService } from './workflow.service';
import { PrismaService } from '../../common/prisma/prisma.service';

const mockPrisma = () => ({
  user: { findUnique: jest.fn() },
  content: { findUnique: jest.fn() },
  workflow: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  $transaction: jest.fn(),
});

describe('WorkflowService', () => {
  let service: WorkflowService;
  let prisma: ReturnType<typeof mockPrisma>;

  beforeEach(async () => {
    prisma = mockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(WorkflowService);
  });

  const approver = { id: 'user-1' };
  const content = { id: 'content-1' };
  const pendingWorkflow = {
    id: 'wf-1',
    contentId: 'content-1',
    approverId: 'user-1',
    status: 'PENDING',
    comment: null,
    createdAt: new Date('2026-01-01'),
  };

  describe('createApprovalFlow', () => {
    it('creates a PENDING workflow linked to content', async () => {
      prisma.user.findUnique.mockResolvedValue(approver);
      prisma.content.findUnique.mockResolvedValue(content);
      prisma.workflow.findFirst.mockResolvedValue(null);
      prisma.workflow.create.mockResolvedValue(pendingWorkflow);

      const result = await service.createApprovalFlow('content-1', 'user-1');

      expect(prisma.workflow.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'PENDING', approverId: 'user-1' }),
        }),
      );
      expect(result).toEqual(pendingWorkflow);
    });

    it('throws NotFound when the approver does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.createApprovalFlow('content-1', 'ghost'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFound when the content does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(approver);
      prisma.content.findUnique.mockResolvedValue(null);

      await expect(
        service.createApprovalFlow('ghost', 'user-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws BadRequest when a PENDING flow already exists for the content', async () => {
      prisma.user.findUnique.mockResolvedValue(approver);
      prisma.content.findUnique.mockResolvedValue(content);
      prisma.workflow.findFirst.mockResolvedValue(pendingWorkflow);

      await expect(
        service.createApprovalFlow('content-1', 'user-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('approve', () => {
    it('transitions a PENDING workflow to APPROVED', async () => {
      prisma.workflow.findUnique.mockResolvedValue(pendingWorkflow);
      prisma.workflow.update.mockResolvedValue({
        ...pendingWorkflow,
        status: 'APPROVED',
        comment: 'looks good',
      });

      const result = await service.approve('wf-1', 'user-1', 'looks good');

      expect(prisma.workflow.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'wf-1' },
          data: { status: 'APPROVED', approverId: 'user-1', comment: 'looks good' },
        }),
      );
      expect(result.status).toBe('APPROVED');
    });

    it('throws NotFound when the workflow does not exist', async () => {
      prisma.workflow.findUnique.mockResolvedValue(null);

      await expect(service.approve('ghost', 'user-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws BadRequest when the workflow is already finalized', async () => {
      prisma.workflow.findUnique.mockResolvedValue({
        ...pendingWorkflow,
        status: 'APPROVED',
      });

      await expect(service.approve('wf-1', 'user-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('reject', () => {
    it('transitions a PENDING workflow to REJECTED', async () => {
      prisma.workflow.findUnique.mockResolvedValue(pendingWorkflow);
      prisma.workflow.update.mockResolvedValue({
        ...pendingWorkflow,
        status: 'REJECTED',
        comment: 'fix tone',
      });

      const result = await service.reject('wf-1', 'user-1', 'fix tone');

      expect(prisma.workflow.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'wf-1' },
          data: { status: 'REJECTED', approverId: 'user-1', comment: 'fix tone' },
        }),
      );
      expect(result.status).toBe('REJECTED');
    });
  });

  describe('findAll', () => {
    it('returns a paginated list via $transaction', async () => {
      prisma.$transaction.mockResolvedValue([[], 0]);

      const result = await service.findAll({ skip: 5, take: 10 });

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(result).toEqual({ items: [], total: 0, skip: 5, take: 10 });
    });

    it('throws BadRequest for an invalid status filter', async () => {
      await expect(
        service.findAll({ status: 'WAT' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('findOne', () => {
    it('returns the workflow when it exists', async () => {
      prisma.workflow.findUnique.mockResolvedValue(pendingWorkflow);

      const result = await service.findOne('wf-1');

      expect(result).toEqual(pendingWorkflow);
    });

    it('throws NotFound when the workflow does not exist', async () => {
      prisma.workflow.findUnique.mockResolvedValue(null);

      await expect(service.findOne('ghost')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
