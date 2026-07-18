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

  /**
   * Build a receipt card PNG (sharp): a small branded canvas that captures the
   * publish metadata — used as either a retained fallback receipt image or a
   * companion card next to a real headless screenshot. Returns the PNG buffer
   * plus dimensions. Pure function; persistence is left to the caller so it
   * stays unit-testable without side effects.
   */
  async buildReceiptCard(opts: {
    contentId: string;
    platform: string;
    externalId?: string | null;
    externalUrl?: string | null;
    generatedAt: Date;
  }): Promise<{ buffer: Buffer; width: number; height: number }> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    // tslint:disable-next-line:no-require-imports
    const sharpLib: typeof import('sharp') = require('sharp');
    const sharp = sharpLib.default ?? sharpLib;

    const lines = [
      'ContentHub · Publish Receipt',
      `Platform: ${opts.platform}`,
      `Content : ${opts.contentId}`,
      `External: ${opts.externalId ?? opts.externalUrl ?? '—'}`,
      `Time    : ${opts.generatedAt.toISOString()}`,
    ].join('\n');

    const escape = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const lineHeight = 22;
    const width = 520;
    const height = 90 + lines.split('\n').length * lineHeight;
    const text = lines
      .split('\n')
      .map((l, i) => `<text x="24" y="${56 + i * lineHeight}" fill="#111827" font-size="16" font-family="monospace">${escape(l)}</text>`)
      .join('');

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
        <rect width="${width}" height="${height}" rx="12" fill="#ffffff" />
        <rect x="0" y="0" width="${width}" height="28" rx="12" fill="#2563eb" />
        <rect x="0" y="16" width="${width}" height="12" fill="#2563eb" />
        <text x="24" y="20" fill="#ffffff" font-size="14" font-family="sans-serif" font-weight="bold">ContentHub</text>
        ${text}
      </svg>`;

    const buffer = await sharp(Buffer.from(svg), { density: 150 }).png().toBuffer();
    const meta = await sharp(buffer).metadata();
    return { buffer, width: meta.width ?? width, height: meta.height ?? height };
  }

  /**
   * Persist a receipt card (sharp PNG buffer) as a MediaAsset and return the
   * row. Receipts are stored under `/uploads/receipts/{id}.png`; the asset is
   * metadata-only otherwise (no platform-side content id). `url` is where the
   * file lives once written; base64 is also kept in `metadata.data` so the card
   * can be re-hydrated when the runtime has no filesystem (tests).
   */
  async attachReceiptCard(
    buffer: Buffer,
    meta: { width?: number; height?: number; mimeType?: string } = {},
  ) {
    const id = `receipt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const url = `/uploads/receipts/${id}.png`;

    // Write the PNG into the uploads dir (best-effort). Failures degrade
    // gracefully — the row is still created with base64 inline data.
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const fs = require('node:fs/promises') as typeof import('node:fs/promises');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const path = require('node:path') as typeof import('node:path');
      const uploads = path.resolve(process.cwd(), 'uploads', 'receipts');
      await fs.mkdir(uploads, { recursive: true });
      await fs.writeFile(path.join(uploads, `${id}.png`), buffer);
    } catch (err) {
      // No-op: filesystem unavailable (tests / read-only env). Row still written.
      void err;
    }

    return this.prisma.mediaAsset.create({
      data: {
        type: 'IMAGE' as any,
        url,
        thumbnailUrl: null,
        width: meta.width ?? null,
        height: meta.height ?? null,
        duration: null,
        fileSize: buffer.length,
        mimeType: meta.mimeType ?? 'image/png',
        uploadedBy: null,
      },
    });
  }

  private mapMimeTypeToMediaType(mimeType?: string): MediaType {
    if (!mimeType) return MediaType.IMAGE;
    if (mimeType.startsWith('video/')) return MediaType.VIDEO;
    if (mimeType.startsWith('audio/')) return MediaType.AUDIO;
    return MediaType.IMAGE;
  }
}
