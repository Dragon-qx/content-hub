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
import { MediaService, UploadedMultipartFile } from './media.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MediaQueryDto } from './dto/media-query.dto';

@Controller('media')
@UseGuards(JwtAuthGuard)
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  upload(@UploadedFile() file: UploadedMultipartFile | undefined, @Body('contentId') contentId?: string) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    return this.media.upload(file, contentId);
  }

  @Get() findAll(@Query() query: MediaQueryDto) {
    return this.media.findAll({
      contentId: query.contentId,
      type: query.type,
      q: query.q,
      skip: query.skip,
      take: query.take,
    });
  }

  @Get(':id') findOne(@Param('id') id: string) { return this.media.findOne(id); }
  @Delete(':id') remove(@Param('id') id: string) { return this.media.remove(id); }
}
