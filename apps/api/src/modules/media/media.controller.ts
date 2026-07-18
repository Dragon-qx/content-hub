import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Post,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { join } from 'path';
import { MediaService, UploadedMultipartFile } from './media.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MediaQueryDto } from './dto/media-query.dto';
import { VideoProcessingService, TranscodeOptions } from './video-processing.service';
import { TranscodeVideoDto, TRANSCODE_RESOLUTIONS, TRANSCODE_FORMATS } from './dto/transcode-video.dto';
// Convert readonly tuples to mutable arrays for Swagger schema (which expects mutable types).
const TRANSCODE_RESOLUTIONS_MUTABLE = [...TRANSCODE_RESOLUTIONS];
const TRANSCODE_FORMATS_MUTABLE = [...TRANSCODE_FORMATS];
import { ExtractCoverDto } from './dto/extract-cover.dto';
import { mkdirSync } from 'fs';

@ApiTags('Media')
@ApiBearerAuth()
@Controller('media')
@UseGuards(JwtAuthGuard)
export class MediaController {
  constructor(
    private readonly media: MediaService,
    private readonly videoProcessing: VideoProcessingService,
  ) {}

  @ApiOperation({ summary: 'Upload a media asset', description: 'Uploads a single file (optionally tied to a content item) as multipart/form-data.' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary', description: 'The media file' },
        contentId: { type: 'string', description: 'Optional owning content id' },
      },
    },
  })
  @Post('upload')
  @ApiCreatedResponse({ description: 'Media asset uploaded.' })
  @UseInterceptors(FileInterceptor('file'))
  upload(@UploadedFile() file: UploadedMultipartFile | undefined, @Body('contentId') contentId?: string) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    return this.media.upload(file, contentId);
  }

  @ApiOperation({ summary: 'List media assets', description: 'Paginated listing with content / type / search filters.' })
  @Get() findAll(@Query() query: MediaQueryDto) {
    return this.media.findAll({
      contentId: query.contentId,
      type: query.type,
      q: query.q,
      skip: query.skip,
      take: query.take,
    });
  }

  @ApiOperation({ summary: 'Get media asset by id' })
  @ApiParam({ name: 'id', description: 'Media asset id' })
  @ApiOkResponse({ description: 'Media asset detail.' })
  @ApiNotFoundResponse({ description: 'Media asset not found.' })
  @Get(':id') findOne(@Param('id') id: string) { return this.media.findOne(id); }

  @ApiOperation({ summary: 'Delete media asset' })
  @ApiParam({ name: 'id', description: 'Media asset id' })
  @Delete(':id') remove(@Param('id') id: string) { return this.media.remove(id); }

  @ApiOperation({
    summary: 'Transcode a video to multiple resolutions',
    description: 'Uploads a video file and transcodes it to 720p/1080p in the chosen container (mp4/webm).',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary', description: 'The video file' },
        resolutions: {
          type: 'array',
          items: { type: 'string', enum: TRANSCODE_RESOLUTIONS_MUTABLE },
          default: ['720p', '1080p'],
        },
        format: {
          type: 'string',
          enum: TRANSCODE_FORMATS_MUTABLE,
          default: 'mp4',
        },
      },
    },
  })
  @ApiCreatedResponse({ description: 'Job accepted — video queued for transcoding.' })
  @Post('video/transcode')
  @UseInterceptors(FileInterceptor('file'))
  async transcode(
    @UploadedFile() file: UploadedMultipartFile | undefined,
    @Body() body: TranscodeVideoDto,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const inputPath = this.persistUpload(file, 'video');

    const options: TranscodeOptions = {
      resolutions: body.resolutions ?? ['720p', '1080p'],
      format: body.format ?? 'mp4',
    };

    const outputDir = await this.videoProcessing.transcode(inputPath, options);
    return {
      status: 'completed',
      inputPath,
      outputDir,
      resolutions: options.resolutions,
      format: options.format,
    };
  }

  @ApiOperation({
    summary: 'Extract a cover frame from a video',
    description: 'Uploads a video file and extracts a single frame at the given time offset (seconds) as JPEG.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary', description: 'The video file' },
        timeSeconds: { type: 'integer', description: 'Time offset in seconds from the start', default: 0 },
      },
    },
  })
  @ApiCreatedResponse({ description: 'Cover image path returned.' })
  @Post('video/cover')
  @UseInterceptors(FileInterceptor('file'))
  async extractCover(
    @UploadedFile() file: UploadedMultipartFile | undefined,
    @Body() body: ExtractCoverDto,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const inputPath = this.persistUpload(file, 'video');
    const coverPath = await this.videoProcessing.extractCover(inputPath, body.timeSeconds);
    return { status: 'completed', coverPath };
  }

  @ApiOperation({ summary: 'Get video metadata' })
  @ApiParam({ name: 'id', description: 'Media asset id — the `url` field from a previously uploaded media asset' })
  @ApiOkResponse({ description: 'Metadata returned.' })
  @Get('video/:id/metadata')
  async getMetadata(@Param('id') id: string) {
    const asset = await this.media.findOne(id);
    const videoPath = join(process.cwd(), 'uploads', asset.url.replace('/uploads/', ''));
    const meta = await this.videoProcessing.getMetadata(videoPath);
    return { id, ...meta };
  }

  /**
   * Persist the uploaded file to disk under a structured uploads directory.
   * Returns the absolute path to the saved file.
   */
  private persistUpload(file: { filename?: string; originalname?: string; buffer?: Buffer }, subdir: string): string {
    const uploadsDir = join(process.cwd(), 'uploads', subdir);
    mkdirSync(uploadsDir, { recursive: true });
    const filename = (file.filename ?? file.originalname ?? `video-${Date.now()}`).replace(/[^a-zA-Z0-9._\-]/g, '_');
    const absPath = join(uploadsDir, filename);
    if (file.buffer && file.buffer.length > 0) {
      const fs = require('fs');
      fs.writeFileSync(absPath, file.buffer);
    }
    return absPath;
  }
}
