import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ContentType, Prisma, ContentTemplate } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

/** A single variable definition on a template. */
export interface TemplateVariable {
  /** Key used in the placeholder, e.g. `productName`. */
  key: string;
  /** Human-readable label for the UI. */
  label: string;
  /** Variable type — `text`, `number`, or `date`. */
  type?: 'text' | 'number' | 'date';
  /** Default value used when the caller does not supply one. */
  defaultValue?: string;
  /** Whether the variable must be provided (no empty string allowed). */
  required?: boolean;
}

/** Resolved variable values, keyed by variable key. */
export type VariableValues = Record<string, string>;

/** Input for creating a template — see {@link CreateContentTemplateDto}. */
export interface CreateTemplateInput {
  title: string;
  body?: string;
  contentType?: ContentType;
  teamId: string;
  tags?: string[];
  variables?: TemplateVariable[];
}

/** Input for patching a template — see {@link UpdateContentTemplateDto}. */
export interface UpdateTemplateInput {
  title?: string;
  body?: string;
  contentType?: ContentType;
  tags?: string[];
  variables?: TemplateVariable[];
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
  /** Optional variable values to substitute placeholders (`{{variableKey}}`). */
  values?: VariableValues;
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
        variables: (dto.variables ?? []) as unknown as Prisma.InputJsonValue,
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
    if (dto.variables !== undefined) data.variables = dto.variables as unknown as Prisma.InputJsonValue;

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
   * Resolve variables in a template's body by substituting placeholders
   * `{{variableKey}}` with corresponding values from `values`.
   *
   * Resolution rules:
   * - Placeholders without a matching value fall back to the variable's
   *   `defaultValue`.
   * - If no default exists either, the placeholder is left as-is.
   * - All occurrences of the same placeholder (case-sensitive) are replaced.
   * - Text outside placeholders is preserved untouched.
   */
  resolveVariables(body: string, variables: TemplateVariable[], values: VariableValues): string {
    let result = body;
    for (const v of variables) {
      const placeholder = `{{${v.key}}}`;
      const replacement = values[v.key] ?? v.defaultValue ?? placeholder;
      result = result.split(placeholder).join(replacement);
    }
    return result;
  }

  /**
   * Resolve variables in a template's body and title. Convenience wrapper for
   * `resolveVariables()` that operates on both fields at once. Throws
   * NotFoundException if the template does not exist.
   */
  async resolve(templateId: string, values: VariableValues): Promise<{ title: string; body: string }> {
    const template = await this.findOneGrid(templateId);
    const vars = (template.variables as unknown as TemplateVariable[]) ?? [];
    return {
      title: this.resolveVariables(template.title, vars, values),
      body: this.resolveVariables(template.body ?? '', vars, values),
    };
  }

  /** Internal helper — fetch a template or throw NotFoundException. */
  private async findOneGrid(id: string) {
    const template = await this.prisma.contentTemplate.findUnique({ where: { id } });
    if (!template) {
      throw new NotFoundException(`ContentTemplate ${id} not found`);
    }
    return template;
  }

  /**
   * Apply a template to seed a new draft. Returns the input shape for
   * `ContentService.create`, so the caller can persist it as DRAFT content or
   * hand it to the editor for further tweaking. The template's team must match
   * the requested team.
   *
   * If `values` are provided and the template defines `variables`, placeholders
   * `{{variableKey}}` in the title and body are substituted before the seed is returned.
   */
  async apply(id: string, dto: ApplyTemplateInput): Promise<TemplateDraftSeed> {
    const template = await this.findOne(id);
    if (template.teamId !== dto.teamId) {
      throw new BadRequestException('Template does not belong to the given team');
    }
    const vars = (template.variables as unknown as TemplateVariable[]) ?? [];
    const values = dto.values ?? {};
    return {
      title: this.resolveVariables(dto.title ?? template.title, vars, values),
      // `body` is nullable in the schema; normalise null → undefined for the
      // ContentService.create input shape.
      body: this.resolveVariables(template.body ?? '', vars, values) || undefined,
      contentType: template.contentType,
      teamId: dto.teamId,
      tags: template.tags,
    };
  }
}
