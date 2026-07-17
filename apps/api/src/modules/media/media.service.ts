import { Injectable, NotFoundException } from '@nestjs/common';
import { MediaType, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

/** Fields the API layer reads from an uploaded file (multipart). */
export interface UploadedMultipartFile {
  mimetype?: string;
  filename?: string;
  originalname?: string;
  size?: number;
  width?: number;
  height?: number;
  duration?: number;
  uploadedBy?: string;
}

/** Query params for listing media assets. */
export interface ListMediaParams {
  contentId?: string;
  type?: string;
  q?: string;
  skip?: number;
  take?: number;
}

@Injectable()
export class MediaService {
  constructor(private readonly prisma: PrismaService) {}

  async upload(file: UploadedMultipartFile, contentId?: string) {
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

  /**
   * 将前端传入的 media type 映射为后端 MediaType 枚举
   * 前端可能传: image/video/document → 后端: IMAGE/VIDEO/AUDIO
   */
  private mapTypeParam(type: string): MediaType {
    const t = type.toLowerCase();
    if (t === 'image') return MediaType.IMAGE;
    if (t === 'video') return MediaType.VIDEO;
    if (t === 'document') return MediaType.AUDIO; // document 映射为 AUDIO（后端无 DOCUMENT）
    // 如果后端直接传了大写，也支持
    if (t === 'IMAGE' || t === 'VIDEO' || t === 'AUDIO') return t as MediaType;
    return type as MediaType; // 兜底：原样回退
  }

  async findAll(params: ListMediaParams = {}) {
    const where: Prisma.MediaAssetWhereInput = {};
    if (params.contentId) where.contentId = params.contentId;

    // 处理类型过滤：前端可能传 image/video/document/IMAGE/VIDEO/AUDIO
    if (params.type) {
      where.type = this.mapTypeParam(params.type);
    }

    // 处理搜索：对 url 字段做 contains 搜索，提取文件名匹配
    if (params.q) {
      where.url = { contains: params.q };
    }

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
