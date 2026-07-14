import { Controller, Delete, Get, Param, Query, UploadedFile, UseInterceptors, Post } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MediaService } from './media.service';

@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  upload(@UploadedFile() file: any, @Query('contentId') contentId?: string) {
    return this.media.upload(file, contentId);
  }

  @Get() findAll(@Query('contentId') contentId?: string) {
    return this.media.findAll({ contentId });
  }

  @Get(':id') findOne(@Param('id') id: string) { return this.media.findOne(id); }
  @Delete(':id') remove(@Param('id') id: string) { return this.media.remove(id); }
}
