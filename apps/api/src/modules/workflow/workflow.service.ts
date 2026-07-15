import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

export type WorkflowStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface CreateWorkflowDto {
  contentId: string;
  approverId: string;
}

export interface ApproveWorkflowDto {
  approverId: string;
  comment?: string;
}

export interface RejectWorkflowDto {
  approverId: string;
  reason?: string;
}

export interface ListWorkflowsDto {
  skip?: number;
  take?: number;
  status?: WorkflowStatus;
  contentId?: string;
  approverId?: string;
}

@Injectable()
export class WorkflowService {
  constructor(private readonly prisma: PrismaService) {}

  async createApprovalFlow(dto: CreateWorkflowDto) {
    const content = await this.prisma.content.findUnique({
      where: { id: dto.contentId },
    });
    if (!content) {
      throw new NotFoundException(`Content ${dto.contentId} not found`);
    }

    const approver = await this.prisma.user.findUnique({
      where: { id: dto.approverId },
    });
    if (!approver) {
      throw new NotFoundException(`Approver ${dto.approverId} not found`);
    }

    const workflow = await this.prisma.workflow.create({
      data: {
        contentId: dto.contentId,
        approverId: dto.approverId,
        status: 'PENDING',
      },
      include: {
        content: {
          select: { id: true, title: true, status: true },
        },
      },
    });

    await this.prisma.content.update({
      where: { id: dto.contentId },
      data: { status: 'IN_REVIEW' },
    });

    return workflow;
  }

  async approve(id: string, dto: ApproveWorkflowDto) {
    const workflow = await this.prisma.workflow.findUnique({
      where: { id: id },
    });
    if (!workflow) {
      throw new NotFoundException(`Workflow ${id} not found`);
    }
    if (workflow.status !== 'PENDING') {
      throw new NotFoundException(`Workflow ${id} is not pending (current: ${workflow.status})`);
    }

    if (!workflow.contentId) {
      throw new NotFoundException(`Workflow ${id} has no associated content`);
    }

    const [updated] = await this.prisma.$transaction([
      this.prisma.workflow.update({
        where: { id },
        data: {
          status: 'APPROVED',
          comment: dto.comment,
        },
        include: {
          content: {
            select: { id: true, title: true, status: true },
          },
        },
      }),
      this.prisma.content.update({
        where: { id: workflow.contentId },
        data: { status: 'APPROVED' },
      }),
    ]);

    return updated;
  }

  async reject(id: string, dto: RejectWorkflowDto) {
    const workflow = await this.prisma.workflow.findUnique({
      where: { id: id },
    });
    if (!workflow) {
      throw new NotFoundException(`Workflow ${id} not found`);
    }
    if (workflow.status !== 'PENDING') {
      throw new NotFoundException(`Workflow ${id} is not pending (current: ${workflow.status})`);
    }

    if (!workflow.contentId) {
      throw new NotFoundException(`Workflow ${id} has no associated content`);
    }

    const [updated] = await this.prisma.$transaction([
      this.prisma.workflow.update({
        where: { id: id },
        data: {
          status: 'REJECTED',
          comment: dto.reason,
        },
        include: {
          content: {
            select: { id: true, title: true, status: true },
          },
        },
      }),
      this.prisma.content.update({
        where: { id: workflow.contentId },
        data: { status: 'DRAFT' },
      }),
    ]);

    return updated;
  }

  async findAll(dto: ListWorkflowsDto = {}) {
    const where: any = {};
    if (dto.status) where.status = dto.status;
    if (dto.contentId) where.contentId = dto.contentId;
    if (dto.approverId) where.approverId = dto.approverId;

    const [items, total] = await Promise.all([
      this.prisma.workflow.findMany({
        where,
        skip: dto.skip,
        take: dto.take ?? 20,
        orderBy: { createdAt: 'desc' },
        include: {
          content: {
            select: { id: true, title: true, status: true },
          },
        },
      }),
      this.prisma.workflow.count({ where }),
    ]);

    return { items, total, skip: dto.skip ?? 0, take: dto.take ?? 20 };
  }

  async findOne(id: string) {
    const workflow = await this.prisma.workflow.findUnique({
      where: { id },
      include: {
        content: {
          select: { id: true, title: true, status: true, body: true },
        },
      },
    });

    if (!workflow) {
      throw new NotFoundException(`Workflow ${id} not found`);
    }

    return workflow;
  }

  async findPendingByContent(contentId: string) {
    return this.prisma.workflow.findMany({
      where: {
        contentId,
        status: 'PENDING',
      },
      include: {
        content: {
          select: { id: true, title: true, status: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }
}
