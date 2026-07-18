import { Module } from '@nestjs/common';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { VideoProcessingService } from './video-processing.service';
import { MulterModule } from '@nestjs/platform-express';

@Module({
  imports: [MulterModule.register({ limits: { fileSize: 2 * 1024 * 1024 * 1024 } })],
  controllers: [MediaController],
  providers: [MediaService, VideoProcessingService],
  exports: [MediaService, VideoProcessingService],
})
export class MediaModule {}
