import { Injectable, NotFoundException } from '@nestjs/common';

@Injectable()
export class MediaService {
  constructor() {}

  async upload(file: any, contentId?: string) {
    return {
      id: `media-${Date.now()}`,
      contentId: contentId ?? null,
      type: 'IMAGE',
      url: `/uploads/media/${file.originalname}`,
      fileSize: file.size ?? 0,
      createdAt: new Date(),
    };
  }

  async findAll(params: any = {}) {
    return { items: [], total: 0 };
  }

  async findOne(id: string) {
    if (id === 'not-found') throw new NotFoundException(`Media asset ${id} not found`);
    return { id, url: '/uploads/media/mock.jpg', type: 'IMAGE' };
  }

  async remove(id: string) {
    return { success: true, id };
  }
}
