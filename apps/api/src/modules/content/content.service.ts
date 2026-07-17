import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import {
  ContentStatus,
  ContentType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { WorkflowService } from '../workflow/workflow.service';

/** Input shape for creating content — see CreateContentDto. */
export interface CreateContentInput {
  title: string;
  body?: string;
  contentType?: ContentType;
  teamId: string;
  tags?: string[];
}

/** Input shape for patching content — see UpdateContentDto. */
export interface UpdateContentInput {
  title?: string;
  body?: string;
  contentType?: ContentType;
  status?: ContentStatus;
  scheduledAt?: Date | string | null;
  publishedAt?: Date | string | null;
}

/** Query params for listing content. */
export interface ListContentParams {
  skip?: number;
  take?: number;
  status?: ContentStatus;
  teamId?: string;
  createdBy?: string;
  search?: string;
}

/** Input shape for creating a new version — see CreateContentVersionDto. */
export interface CreateVersionInput {
  title?: string;
  body?: string;
  contentType?: ContentType;
  changeNote?: string;
}

/**
 * Allowed content status transitions.
 *
 * Implements the PRD state machine:
 *   DRAFT → IN_REVIEW → APPROVED → SCHEDULED → PUBLISHING → PUBLISHED
 * with rejection/back-editing and retry paths.
 */
export const CONTENT_TRANSITIONS: Record<ContentStatus, ContentStatus[]> = {
  [ContentStatus.DRAFT]: [
    ContentStatus.IN_REVIEW,
    ContentStatus.ARCHIVED,
  ],
  [ContentStatus.IN_REVIEW]: [
    ContentStatus.APPROVED,
    ContentStatus.DRAFT,
  ],
  [ContentStatus.APPROVED]: [
    ContentStatus.SCHEDULED,
    ContentStatus.DRAFT,
    ContentStatus.ARCHIVED,
  ],
  [ContentStatus.SCHEDULED]: [
    ContentStatus.PUBLISHING,
    ContentStatus.APPROVED,
    ContentStatus.DRAFT,
  ],
  [ContentStatus.PUBLISHING]: [
    ContentStatus.PUBLISHED,
    ContentStatus.FAILED,
  ],
  [ContentStatus.FAILED]: [
    ContentStatus.SCHEDULED,
    ContentStatus.DRAFT,
  ],
  [ContentStatus.PUBLISHED]: [ContentStatus.ARCHIVED],
  [ContentStatus.ARCHIVED]: [],
};

@Injectable()
export class ContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workflow: WorkflowService,
  ) {}

  // ===== CRUD =====

  async create(dto: CreateContentInput, userId: string) {
    if (!dto.teamId) {
      throw new BadRequestException('teamId 不能为空');
    }
    const version = 1;
    const content = await this.prisma.content.create({
      data: {
        title: dto.title,
        body: dto.body,
        contentType: dto.contentType ?? ContentType.TEXT,
        status: ContentStatus.DRAFT,
        teamId: dto.teamId,
        createdBy: userId,
        version,
        tags: dto.tags?.length
          ? { create: dto.tags.map((name: string) => ({ name })) }
          : undefined,
        versions: {
          create: {
            version,
            title: dto.title,
            body: dto.body,
            contentType: dto.contentType ?? ContentType.TEXT,
            changedBy: userId,
            changeNote: 'Initial version',
          },
        },
      },
      include: { tags: true, versions: { take: 1 } },
    });
    return content;
  }

  async findAll(params: ListContentParams = {}) {
    const where: Prisma.ContentWhereInput = {};
    if (params.status) where.status = params.status;
    if (params.teamId) where.teamId = params.teamId;
    if (params.createdBy) where.createdBy = params.createdBy;
    if (params.search) {
      where.OR = [
        { title: { contains: params.search, mode: 'insensitive' } },
        { body: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.content.findMany({
        where,
        skip: params.skip,
        take: params.take ?? 20,
        orderBy: { updatedAt: 'desc' },
        include: { tags: true, platformPosts: true },
      }),
      this.prisma.content.count({ where }),
    ]);

    return { items, total, skip: params.skip ?? 0, take: params.take ?? 20 };
  }

  async findOne(id: string) {
    const content = await this.prisma.content.findUnique({
      where: { id },
      include: { tags: true, platformPosts: true, versions: true, workflow: true },
    });
    if (!content) throw new NotFoundException(`Content ${id} not found`);
    return content;
  }

  async update(id: string, dto: UpdateContentInput, userId?: string) {
    await this.findOne(id);

    // Enforce the status state machine whenever a status change is requested.
    if (dto.status !== undefined) {
      const current = await this.prisma.content.findUnique({
        where: { id },
        select: { status: true },
      });
      if (current) {
        this.assertTransition(current.status, dto.status);
      }
    }

    const data: Prisma.ContentUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.body !== undefined) data.body = dto.body;
    if (dto.contentType !== undefined) data.contentType = dto.contentType;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.scheduledAt !== undefined) data.scheduledAt = dto.scheduledAt;
    if (dto.publishedAt !== undefined) data.publishedAt = dto.publishedAt;

    return this.prisma.content.update({
      where: { id },
      data,
      include: { tags: true },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.content.delete({ where: { id } });
    return { success: true, id };
  }

  async createVersion(id: string, dto: CreateVersionInput, userId: string) {
    const content = await this.findOne(id);
    const newVersion = content.version + 1;
    return this.prisma.$transaction([
      this.prisma.content.update({
        where: { id },
        data: {
          version: newVersion,
          title: dto.title ?? content.title,
          body: dto.body ?? content.body,
          contentType: dto.contentType ?? content.contentType,
        },
      }),
      this.prisma.contentVersion.create({
        data: {
          contentId: id,
          version: newVersion,
          title: dto.title ?? content.title,
          body: dto.body,
          contentType: dto.contentType ?? content.contentType,
          changedBy: userId,
          changeNote: dto.changeNote,
        },
      }),
    ]);
  }

  // ===== Status state machine =====

  /** True if `from` may transition to `to`. */
  canTransition(from: ContentStatus, to: ContentStatus): boolean {
    return CONTENT_TRANSITIONS[from]?.includes(to) ?? false;
  }

  /** Throw BadRequestException if the transition is not allowed. */
  assertTransition(from: ContentStatus, to: ContentStatus): void {
    if (from === to) return; // idempotent no-op
    if (!this.canTransition(from, to)) {
      throw new BadRequestException(
        `Invalid status transition: ${from} → ${to}`,
      );
    }
  }

  /** Apply a validated status transition and return the updated content. */
  private async transitionStatus(
    id: string,
    to: ContentStatus,
    userId: string,
  ) {
    return this.prisma.content.update({
      where: { id },
      data: { status: to },
      include: { tags: true, workflow: true },
    });
  }

  /**
   * Submit a draft for review (DRAFT → IN_REVIEW). Creates a workflow approval
   * flow for the content's team admin.
   */
  async submitForReview(id: string, userId: string, approverId?: string) {
    const content = await this.findOne(id);
    this.assertTransition(content.status, ContentStatus.IN_REVIEW);

    const approver =
      approverId ?? (await this.resolveApprover(content.teamId, userId));

    await this.workflow.createApprovalFlow(
      id,
      approver,
      `Content "${content.title}" submitted for review`,
    );
    return this.transitionStatus(id, ContentStatus.IN_REVIEW, userId);
  }

  /** Approve content under review (IN_REVIEW → APPROVED) and close its workflow. */
  async approveContent(id: string, approverId: string, comment?: string) {
    const content = await this.findOne(id);
    const to = ContentStatus.APPROVED;
    this.assertTransition(content.status, to);

    const pending = await this.workflow.findPendingForContent(id);
    if (pending) {
      await this.workflow.approve(pending.id, approverId, comment);
    }
    return this.transitionStatus(id, to, approverId);
  }

  /** Reject content under review (IN_REVIEW → DRAFT) and close its workflow. */
  async rejectContent(id: string, approverId: string, reason?: string) {
    const content = await this.findOne(id);
    const to = ContentStatus.DRAFT;
    this.assertTransition(content.status, to);

    const pending = await this.workflow.findPendingForContent(id);
    if (pending) {
      await this.workflow.reject(pending.id, approverId, reason);
    }
    return this.transitionStatus(id, to, approverId);
  }

  /** Archive content (allowed from several stable states). */
  async archive(id: string, userId: string) {
    const content = await this.findOne(id);
    const to = ContentStatus.ARCHIVED;
    this.assertTransition(content.status, to);
    return this.transitionStatus(id, to, userId);
  }

  /**
   * Resolve a default approver for a team: a member with the ADMIN role,
   * falling back to the team owner.
   */
  private async resolveApprover(teamId: string, submitterId: string): Promise<string> {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      include: { members: true },
    });
    if (!team) {
      throw new NotFoundException(`Team ${teamId} not found`);
    }
    const admin = team.members.find((m) => m.role === 'ADMIN');
    return admin?.userId ?? team.ownerId ?? submitterId;
  }
}
