import { Injectable, NotFoundException } from '@nestjs/common';
import { ContentStatus, ContentType } from '@prisma/client';

@Injectable()
export class ContentService {
  constructor() {}

  async create(dto: any, userId: string) {
    return {
      id: `content-${Date.now()}`,
      title: dto.title,
      body: dto.body ?? '',
      contentType: dto.contentType ?? ContentType.TEXT,
      status: ContentStatus.DRAFT,
      teamId: dto.teamId ?? '',
      createdBy: userId,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  async findAll(params: any = {}) {
    return { items: [], total: 0, skip: params.skip ?? 0, take: params.take ?? 20 };
  }

  async findOne(id: string) {
    if (id === 'not-found') throw new NotFoundException(`Content ${id} not found`);
    return { id, title: 'Mock Content', status: ContentStatus.DRAFT };
  }

  async update(id: string, dto: any) {
    return { id, ...dto, updatedAt: new Date() };
  }

  async remove(id: string) {
    return { success: true, id };
  }
}
