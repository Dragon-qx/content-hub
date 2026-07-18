import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ContentType, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

/** Input for creating a template — see {@link CreateContentTemplateDto}. */
export interface CreateTemplateInput {
  title: string;
  body?: string;
  contentType?: ContentType;
  teamId: string;
  tags?: string[];
}

/** Input for patching a template — see {@link UpdateContentTemplateDto}. */
export interface UpdateTemplateInput {
  title?: string;
  body?: string;
  contentType?: ContentType;
  tags?: string[];
}

/** Query params for listing templates. */
export interface ListTemplatesParams {
  skip?: number;
  take?: number;
  teamId?: string;
  search?: string;
}

/** Input for applying a template to seed a new draft. */
export interface ApplyTemplateInput {
  templateId: string;
  teamId: string;
  /** Optional override for the seeded draft title; defaults to the template title. */
  title?: string;
}

/** A draft seed returned by `apply()` — the input shape for `ContentService.create`. */
export interface TemplateDraftSeed {
  title: string;
  body?: string;
  contentType: ContentType;
  teamId: string;
  tags: string[];
}

@Injectable()
export class ContentTemplateService {
  constructor(private readonly prisma: PrismaService) {}

  /** Create a reusable content template scoped to a team. */
  async create(dto: CreateTemplateInput, userId: string) {
    if (!dto.teamId) {
      throw new BadRequestException('teamId 不能为空');
    }
    return this.prisma.contentTemplate.create({
      data: {
        title: dto.title,
        body: dto.body,
        contentType: dto.contentType ?? ContentType.TEXT,
        teamId: dto.teamId,
        createdBy: userId,
        tags: dto.tags ?? [],
      },
    });
  }

  /** List templates, optionally filtered by team and a free-text search. */
  async findAll(params: ListTemplatesParams = {}) {
    const where: Prisma.ContentTemplateWhereInput = {};
    if (params.teamId) where.teamId = params.teamId;
    if (params.search) {
      where.OR = [
        { title: { contains: params.search, mode: 'insensitive' } },
        { body: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.contentTemplate.findMany({
        where,
        skip: params.skip ?? 0,
        take: params.take ?? 20,
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.contentTemplate.count({ where }),
    ]);

    return { items, total, skip: params.skip ?? 0, take: params.take ?? 20 };
  }

  /** Fetch one template by id. */
  async findOne(id: string) {
    const template = await this.prisma.contentTemplate.findUnique({
      where: { id },
    });
    if (!template) {
      throw new NotFoundException(`ContentTemplate ${id} not found`);
    }
    return template;
  }

  /** Patch a template's mutable fields. */
  async update(id: string, dto: UpdateTemplateInput) {
    await this.findOne(id);

    const data: Prisma.ContentTemplateUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.body !== undefined) data.body = dto.body;
    if (dto.contentType !== undefined) data.contentType = dto.contentType;
    if (dto.tags !== undefined) data.tags = dto.tags;

    return this.prisma.contentTemplate.update({
      where: { id },
      data,
    });
  }

  /** Delete a template. */
  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.contentTemplate.delete({ where: { id } });
    return { success: true, id };
  }

  /**
   * Apply a template to seed a new draft. Returns the input shape for
   * `ContentService.create`, so the caller can persist it as DRAFT content or
   * hand it to the editor for further tweaking. The template's team must match
   * the requested team.
   */
  async apply(id: string, dto: ApplyTemplateInput): Promise<TemplateDraftSeed> {
    const template = await this.findOne(id);
    if (template.teamId !== dto.teamId) {
      throw new BadRequestException('Template does not belong to the given team');
    }
    return {
      title: dto.title ?? template.title,
      // `body` is nullable in the schema; normalise null → undefined for the
      // ContentService.create input shape.
      body: template.body ?? undefined,
      contentType: template.contentType,
      teamId: dto.teamId,
      tags: template.tags,
    };
  }
}
