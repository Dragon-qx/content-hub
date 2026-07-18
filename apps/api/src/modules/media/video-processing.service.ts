import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import ffmpeg from 'fluent-ffmpeg';
import { promises as fs } from 'fs';
import * as path from 'path';

export interface TranscodeOptions {
  resolutions: ('720p' | '1080p')[];
  format: 'mp4' | 'webm';
}

export interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
  codec: string;
}

interface ResolutionSpec {
  name: '720p' | '1080p';
  size: string;
}

const RESOLUTION_SPECS: Record<'720p' | '1080p', ResolutionSpec> = {
  '720p': { name: '720p', size: '1280x720' },
  '1080p': { name: '1080p', size: '1920x1080' },
};

/**
 * Video processing service built on fluent-ffmpeg.
 *
 * Exposes transcode (multi-resolution), cover-frame extraction,
 * and metadata probing. Used by the MediaController to handle
 * POST /media/video/transcode, POST /media/video/cover and
 * GET /media/video/:id/metadata.
 */
@Injectable()
export class VideoProcessingService {
  private readonly logger = new Logger(VideoProcessingService.name);

  private readonly videoCodecMap: Record<string, string> = {
    mp4: 'libx264',
    webm: 'libvpx',
  };

  private readonly audioCodecMap: Record<string, string> = {
    mp4: 'aac',
    webm: 'libvorbis',
  };

  private readonly formatMap: Record<string, string> = {
    mp4: 'mp4',
    webm: 'webm',
  };

  /**
   * Transcode an input video to one or more resolutions.
   * Returns the path to the output directory containing all renditions.
   */
  async transcode(inputPath: string, options: TranscodeOptions): Promise<string> {
    await this.assertFileExists(inputPath);

    const ext = options.format;
    const outputDir = path.join(
      path.dirname(inputPath),
      `${path.basename(inputPath, path.extname(inputPath))}_transcoded`,
    );
    await fs.mkdir(outputDir, { recursive: true });

    const videoCodec = this.videoCodecMap[ext];
    const audioCodec = this.audioCodecMap[ext];
    const format = this.formatMap[ext];

    for (const res of options.resolutions) {
      const spec = RESOLUTION_SPECS[res];
      const outputPath = path.join(outputDir, `output_${res}.${ext}`);
      await this.transcodeToResolution(inputPath, spec.size, videoCodec, audioCodec, format, outputPath);
    }

    return outputDir;
  }

  private transcodeToResolution(
    inputPath: string,
    size: string,
    videoCodec: string,
    audioCodec: string,
    format: string,
    outputPath: string,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .size(size)
        .videoCodec(videoCodec)
        .audioCodec(audioCodec)
        .toFormat(format)
        .on('error', (err: Error) => {
          this.logger.error(`Transcode failed for ${inputPath}: ${err.message}`);
          reject(new BadRequestException(`Transcode failed: ${err.message}`));
        })
        .on('end', () => resolve())
        .save(outputPath);
    });
  }

  /**
   * Extract a single frame from `videoPath` at `timeSeconds` and save it as JPEG.
   * Returns the path to the generated cover image.
   */
  async extractCover(videoPath: string, timeSeconds: number): Promise<string> {
    await this.assertFileExists(videoPath);

    const outputPath = path.join(
      path.dirname(videoPath),
      `${path.basename(videoPath, path.extname(videoPath))}_cover.jpg`,
    );

    return new Promise<string>((resolve, reject) => {
      ffmpeg(videoPath)
        .seekInput(timeSeconds)
        .frames(1)
        .on('error', (err: Error) => {
          this.logger.error(`Cover extraction failed for ${videoPath}: ${err.message}`);
          reject(new BadRequestException(`Cover extraction failed: ${err.message}`));
        })
        .on('end', () => resolve(outputPath))
        .save(outputPath);
    });
  }

  /**
   * Probe a video file and return its duration, resolution, and codec name.
   */
  async getMetadata(videoPath: string): Promise<VideoMetadata> {
    await this.assertFileExists(videoPath);

    return new Promise<VideoMetadata>((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (err: Error | null, data: ffmpeg.FfprobeData) => {
        if (err) {
          this.logger.error(`Metadata probe failed for ${videoPath}: ${err.message}`);
          reject(new BadRequestException(`Metadata probe failed: ${err.message}`));
          return;
        }
        const videoStream = data.streams.find((s) => s.codec_type === 'video');
        resolve({
          duration: data.format.duration ?? 0,
          width: videoStream?.width ?? 0,
          height: videoStream?.height ?? 0,
          codec: videoStream?.codec_name ?? '',
        });
      });
    });
  }

  private async assertFileExists(p: string): Promise<void> {
    try {
      await fs.access(p);
    } catch {
      throw new NotFoundException(`Video file not found: ${p}`);
    }
  }
}
