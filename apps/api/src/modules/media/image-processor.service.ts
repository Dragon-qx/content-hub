import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';

export interface ImageOperation {
  /** Crop region (absolute pixels). */
  crop?: { left: number; top: number; width: number; height: number };
  /** Resize (fits inside the box, aspect preserved). */
  resize?: { width?: number; height?: number };
  /** Watermark text, rendered bottom-right. */
  watermark?: string;
  /** Named filter. */
  filter?: 'grayscale' | 'blur' | 'sharpen';
  /** Output format (defaults to input format, fallback jpeg). */
  format?: 'jpeg' | 'png' | 'webp';
  /** Quality 1-100 (for jpeg/webp). */
  quality?: number;
}

@Injectable()
export class ImageProcessorService {
  private readonly logger = new Logger(ImageProcessorService.name);

  /** Run a pipeline of operations on an input buffer and return the result. */
  async process(buffer: Buffer, ops: ImageOperation): Promise<Buffer> {
    let img = sharp(buffer);
    const meta = await img.metadata();

    if (ops.crop) {
      img = img.extract(ops.crop);
    }
    if (ops.resize) {
      img = img.resize(ops.resize.width, ops.resize.height, {
        fit: 'inside',
        withoutEnlargement: true,
      });
    }
    if (ops.watermark) {
      // Composite a simple text watermark (24px, white, 50% opacity).
      const svg = `<svg width="${meta.width ?? 800}" height="${meta.height ?? 600}" xmlns="http://www.w3.org/2000/svg">
        <text x="95%" y="95%" font-size="24" fill="white" fill-opacity="0.5" text-anchor="end">${ops.watermark}</text>
      </svg>`;
      img = img.composite([{ input: Buffer.from(svg), gravity: 'southeast' }]);
    }
    switch (ops.filter) {
      case 'grayscale':
        img = img.grayscale();
        break;
      case 'blur':
        img = img.blur(5);
        break;
      case 'sharpen':
        img = img.sharpen();
        break;
    }

    const fmt = ops.format ?? this.guessFormat(meta.format);
    switch (fmt) {
      case 'png':
        img = img.png();
        break;
      case 'webp':
        img = img.webp({ quality: ops.quality ?? 80 });
        break;
      default:
        img = img.jpeg({ quality: ops.quality ?? 80 });
        break;
    }

    return img.toBuffer();
  }

  private guessFormat(format?: string): 'jpeg' | 'png' | 'webp' {
    if (format === 'png') return 'png';
    if (format === 'webp') return 'webp';
    return 'jpeg';
  }
}
