import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

export const WORKFLOW_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;
export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];

const PUBLIC_SELECT = {
  id: true,
  contentId: true,
  approverId: true,
  status: true,
  comment: true,
  createdAt: true,
} as const;

const assertStatus = (value: string): WorkflowStatus => {
  if (!WORKFLOW_STATUSES.includes(value as WorkflowStatus)) {
    throw new BadRequestException(
      `Invalid status "${value}". Allowed: ${WORKFLOW_STATUSES.join(', ')}`,
    );
  }
  return value as WorkflowStatus;
};

@Injectable()
export class WorkflowService {
  constructor(private readonly prisma: PrismaService) {}

  /** Create an approval workflow for a piece of content. */
  async createApprovalFlow(
    contentId: string,
    approverId: string,
    summary?: string,
  ) {
    const approver = await this.prisma.user.findUnique({
      where: { id: approverId },
      select: { id: true },
    });
    if (!approver) {
      throw new NotFoundException(`Approver user ${approverId} not found`);
    }

    const data: Prisma.WorkflowCreateInput = {
      status: 'PENDING',
      comment: summary ?? null,
      approverId,
    };

    if (contentId) {
      const content = await this.prisma.content.findUnique({
        where: { id: contentId },
        select: { id: true },
      });
      if (!content) {
        throw new NotFoundException(`Content ${contentId} not found`);
      }
      // A content item may only carry one PENDING flow at a time.
      const existing = await this.prisma.workflow.findFirst({
        where: { contentId, status: 'PENDING' },
      });
      if (existing) {
        throw new BadRequestException(
          `A pending approval flow already exists for content ${contentId}`,
        );
      }
      data.content = { connect: { id: contentId } };
    }

    return this.prisma.workflow.create({ data, select: PUBLIC_SELECT });
  }

  /** Approve a workflow. Only a PENDING workflow can be transitioned. */
  async approve(id: string, approverId: string, comment?: string) {
    await this.assertPending(id);
    return this.prisma.workflow.update({
      where: { id },
      data: { status: 'APPROVED', approverId, comment: comment ?? null },
      select: PUBLIC_SELECT,
    });
  }

  /** Reject a workflow. Only a PENDING workflow can be transitioned. */
  async reject(id: string, approverId: string, reason?: string) {
    await this.assertPending(id);
    return this.prisma.workflow.update({
      where: { id },
      data: { status: 'REJECTED', approverId, comment: reason ?? null },
      select: PUBLIC_SELECT,
    });
  }

  /** List workflows with optional filters and pagination. */
  async findAll(
    params: {
      skip?: number;
      take?: number;
      contentId?: string;
      status?: string;
      approverId?: string;
    } = {},
  ) {
    const where: Prisma.WorkflowWhereInput = {};
    if (params.contentId) where.contentId = params.contentId;
    if (params.approverId) where.approverId = params.approverId;
    if (params.status) where.status = assertStatus(params.status);

    const [items, total] = await this.prisma.$transaction([
      this.prisma.workflow.findMany({
        where,
        skip: params.skip ?? 0,
        take: params.take ?? 20,
        orderBy: { createdAt: 'desc' },
        select: PUBLIC_SELECT,
      }),
      this.prisma.workflow.count({ where }),
    ]);

    return { items, total, skip: params.skip ?? 0, take: params.take ?? 20 };
  }

  /** Fetch a single workflow by id. */
  async findOne(id: string) {
    const workflow = await this.prisma.workflow.findUnique({
      where: { id },
      select: PUBLIC_SELECT,
    });
    if (!workflow) {
      throw new NotFoundException(`Workflow ${id} not found`);
    }
    return workflow;
  }

  /** Assert that a workflow exists and is still PENDING. */
  private async assertPending(id: string) {
    const workflow = await this.prisma.workflow.findUnique({
      where: { id },
    });
    if (!workflow) {
      throw new NotFoundException(`Workflow ${id} not found`);
    }
    if (workflow.status !== 'PENDING') {
      throw new BadRequestException(
        `Workflow ${id} is already ${workflow.status} and cannot be changed`,
      );
    }
    return workflow;
  }
}
