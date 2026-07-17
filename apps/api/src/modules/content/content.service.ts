import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ContentStatus, ContentType, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class ContentService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: any, userId: string) {
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

  async findAll(params: any = {}) {
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

  async update(id: string, dto: any, userId?: string) {
    await this.findOne(id);
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

  async createVersion(id: string, dto: any, userId: string) {
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
}
