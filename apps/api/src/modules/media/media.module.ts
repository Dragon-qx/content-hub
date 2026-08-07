import { Module } from '@nestjs/common';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { VideoProcessingService } from './video-processing.service';
import { MulterModule } from '@nestjs/platform-express';
import { extname, join } from 'path';
import { mkdirSync } from 'fs';
import { randomUUID } from 'crypto';

const UPLOADS_DIR = join(process.cwd(), 'uploads', 'media');

// Ensure uploads directory exists at module load
mkdirSync(UPLOADS_DIR, { recursive: true });

@Module({
  imports: [
    MulterModule.register({
      // Use disk storage with unique filenames to prevent conflicts and path traversal.
      // Cast to any to avoid multer type dependency issues.
      storage: {
        _handleFile(_req: unknown, file: any, cb: (err: Error | null, info?: { path: string; size: number }) => void) {
          mkdirSync(UPLOADS_DIR, { recursive: true });
          const ext = extname(file.originalname).toLowerCase();
          const uniqueName = `${Date.now()}-${randomUUID()}${ext}`;
          const absPath = join(UPLOADS_DIR, uniqueName);
          const { createWriteStream } = require('fs');
          const { pipeline } = require('stream');
          const { Readable } = require('stream');

          const writeStream = createWriteStream(absPath);
          // Support both buffer (memoryStorage) and stream modes
          const source = file.buffer
            ? Readable.from(file.buffer)
            : new Readable({ read() { this.push(file.buffer || null); } });

          pipeline(source, writeStream, (err: Error | null) => {
            if (err) return cb(err);
            cb(null, { path: absPath, size: writeStream.bytesWritten });
          });
        },
        _removeFile(_req: unknown, file: any, cb: (err?: Error | null) => void) {
          const { unlink } = require('fs');
          if (file.path) {
            unlink(file.path, cb);
          } else {
            cb();
          }
        },
      },
      limits: {
        fileSize: 100 * 1024 * 1024, // 100 MiB per file
        files: 1,
      },
      fileFilter: (_req: unknown, file: { mimetype: string; originalname: string }, cb: (err: Error | null, accept?: boolean) => void) => {
        const allowedMimes = [
          'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
          'video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo',
          'audio/mpeg', 'audio/wav', 'audio/ogg',
        ];
        // Also validate extension to prevent MIME spoofing
        const ext = extname(file.originalname).toLowerCase();
        const allowedExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.mp4', '.webm', '.mov', '.avi', '.mp3', '.wav', '.ogg'];
        if (allowedMimes.includes(file.mimetype) && allowedExts.includes(ext)) {
          cb(null, true);
        } else {
          cb(new Error(`Unsupported file type: ${file.mimetype} (${ext}). Allowed: images (JPEG/PNG/GIF/WebP), videos (MP4/WebM/MOV), audio (MP3/WAV/OGG)`));
        }
      },
    } as any),
  ],
  controllers: [MediaController],
  providers: [MediaService, VideoProcessingService],
  exports: [MediaService, VideoProcessingService],
})
export class MediaModule {}

export { UPLOADS_DIR };
