import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { MediaType } from '@prisma/client';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { VideoProcessingService } from './video-processing.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

jest.mock('fluent-ffmpeg', () => {
  return Object.assign(
    jest.fn(() => ({
      size: jest.fn().mockReturnThis(),
      videoCodec: jest.fn().mockReturnThis(),
      audioCodec: jest.fn().mockReturnThis(),
      toFormat: jest.fn().mockReturnThis(),
      seekInput: jest.fn().mockReturnThis(),
      frames: jest.fn().mockReturnThis(),
      on: jest.fn().mockReturnThis(),
      save: jest.fn(),
    })),
    { ffprobe: jest.fn((_p: string, cb: Function) => cb(null, { format: {}, streams: [] })) },
  );
});

describe('MediaController', () => {
  let controller: MediaController;
  let service: any;

  beforeEach(async () => {
    service = {
      upload: jest.fn().mockResolvedValue({ id: 'm1' }),
      findAll: jest.fn().mockResolvedValue({ items: [], total: 0, skip: 0, take: 20 }),
      findOne: jest.fn().mockResolvedValue({ id: 'm1', url: '/uploads/media/clip.mp4' }),
      remove: jest.fn().mockResolvedValue({ success: true, id: 'm1' }),
    };

    const module = await Test.createTestingModule({
      controllers: [MediaController],
      providers: [
        { provide: MediaService, useValue: service },
        { provide: VideoProcessingService, useValue: {
          transcode: jest.fn().mockResolvedValue('/tmp/output'),
          extractCover: jest.fn().mockResolvedValue('/tmp/cover.jpg'),
          getMetadata: jest.fn().mockResolvedValue({ duration: 10, width: 1920, height: 1080, codec: 'h264' }),
        }},
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(MediaController);
    jest.clearAllMocks();
  });

  it('requires JwtAuthGuard', () => {
    const reflector = new Reflector();
    const guards = reflector.get('__guards__', MediaController);
    expect(guards).toContain(JwtAuthGuard);
  });

  it('findAll forwards the validated query to the service', async () => {
    await controller.findAll({
      contentId: 'c1',
      type: MediaType.VIDEO,
      q: 'clip',
      skip: 5,
      take: 25,
    } as any);
    expect(service.findAll).toHaveBeenCalledWith({
      contentId: 'c1',
      type: MediaType.VIDEO,
      q: 'clip',
      skip: 5,
      take: 25,
    });
  });
});
