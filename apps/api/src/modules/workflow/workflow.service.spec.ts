import { Test } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { WorkflowService } from './workflow.service';
import { PrismaService } from '../../common/prisma/prisma.service';

describe('WorkflowService', () => {
  let service: WorkflowService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      content: { findUnique: jest.fn(), update: jest.fn() },
      user: { findUnique: jest.fn() },
      workflow: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [WorkflowService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(WorkflowService);
    jest.clearAllMocks();
  });

  it('should create approval flow and set content to IN_REVIEW', async () => {
    prisma.content.findUnique.mockResolvedValue({ id: 'c1' });
    prisma.user.findUnique.mockResolvedValue({ id: 'u1' });
    prisma.workflow.create.mockResolvedValue({ id: 'w1', contentId: 'c1', status: 'PENDING' });
    prisma.content.update.mockResolvedValue({ id: 'c1', status: 'IN_REVIEW' });

    const result = await service.createApprovalFlow({ contentId: 'c1', approverId: 'u1' });
    expect(result.status).toBe('PENDING');
    expect(prisma.content.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'IN_REVIEW' } }),
    );
  });

  it('should reject approval for non-existent content', async () => {
    prisma.content.findUnique.mockResolvedValue(null);
    await expect(service.createApprovalFlow({ contentId: 'bad', approverId: 'u1' }))
      .rejects.toThrow(NotFoundException);
  });

  it('should approve via transaction and update content', async () => {
    prisma.workflow.findUnique.mockResolvedValue({ id: 'w1', status: 'PENDING', contentId: 'c1' });
    prisma.$transaction.mockResolvedValue([
      { id: 'w1', status: 'APPROVED', content: { id: 'c1' } },
    ]);

    const result = await service.approve('w1', { approverId: 'u1', comment: 'OK' });
    expect(result.status).toBe('APPROVED');
  });

  it('should reject non-pending workflow', async () => {
    prisma.workflow.findUnique.mockResolvedValue({ id: 'w1', status: 'APPROVED', contentId: 'c1' });
    await expect(service.approve('w1', { approverId: 'u1' }))
      .rejects.toThrow();
  });

  it('should reject workflow with missing content', async () => {
    prisma.workflow.findUnique.mockResolvedValue({ id: 'w1', status: 'PENDING', contentId: null });
    await expect(service.approve('w1', { approverId: 'u1' }))
      .rejects.toThrow();
  });

  it('should reject a pending workflow', async () => {
    prisma.workflow.findUnique.mockResolvedValue({ id: 'w1', status: 'PENDING', contentId: 'c1' });
    prisma.$transaction.mockResolvedValue([
      { id: 'w1', status: 'REJECTED' },
    ]);

    const result = await service.reject('w1', { approverId: 'u1', reason: 'Not good' });
    expect(result.status).toBe('REJECTED');
  });

  it('should list workflows with pagination', async () => {
    prisma.workflow.findMany.mockResolvedValue([{ id: 'w1' }]);
    prisma.workflow.count.mockResolvedValue(1);

    const result = await service.findAll({ skip: 0, take: 10 });
    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
  });
});
