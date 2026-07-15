import { Injectable, NotFoundException } from '@nestjs/common';
import { MediaType, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class MediaService {
  constructor(private readonly prisma: PrismaService) {}

  async upload(file: any, contentId?: string) {
    return this.prisma.mediaAsset.create({
      data: {
        contentId: contentId ?? null,
        type: this.mapMimeTypeToMediaType(file.mimetype),
        url: `/uploads/media/${file.filename ?? file.originalname}`,
        thumbnailUrl: null,
        width: file.width ?? null,
        height: file.height ?? null,
        duration: file.duration ?? null,
        fileSize: file.size ?? 0,
        mimeType: file.mimetype ?? 'application/octet-stream',
        uploadedBy: file.uploadedBy ?? null,
      },
    });
  }

  async findAll(params: any = {}) {
    const where: Prisma.MediaAssetWhereInput = {};
    if (params.contentId) where.contentId = params.contentId;
    if (params.type) where.type = params.type;

    const [items, total] = await Promise.all([
      this.prisma.mediaAsset.findMany({
        where,
        skip: params.skip,
        take: params.take ?? 20,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.mediaAsset.count({ where }),
    ]);

    return { items, total, skip: params.skip ?? 0, take: params.take ?? 20 };
  }

  async findOne(id: string) {
    const asset = await this.prisma.mediaAsset.findUnique({ where: { id } });
    if (!asset) throw new NotFoundException(`Media asset ${id} not found`);
    return asset;
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.mediaAsset.delete({ where: { id } });
    return { success: true, id };
  }

  private mapMimeTypeToMediaType(mimeType?: string): MediaType {
    if (!mimeType) return MediaType.IMAGE;
    if (mimeType.startsWith('video/')) return MediaType.VIDEO;
    if (mimeType.startsWith('audio/')) return MediaType.AUDIO;
    return MediaType.IMAGE;
  }
}
