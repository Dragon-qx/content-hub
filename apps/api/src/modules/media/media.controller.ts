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
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { MediaService, UploadedMultipartFile } from './media.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MediaQueryDto } from './dto/media-query.dto';

@ApiTags('Media')
@ApiBearerAuth()
@Controller('media')
@UseGuards(JwtAuthGuard)
export class MediaController {
  constructor(private readonly media: MediaService) {}

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
  @Get(':id') findOne(@Param('id') id: string) { return this.media.findOne(id); }

  @ApiOperation({ summary: 'Delete media asset' })
  @ApiParam({ name: 'id', description: 'Media asset id' })
  @Delete(':id') remove(@Param('id') id: string) { return this.media.remove(id); }
}
