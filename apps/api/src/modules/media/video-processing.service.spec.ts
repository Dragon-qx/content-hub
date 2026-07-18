import { VideoProcessingService } from './video-processing.service';
import { NotFoundException } from '@nestjs/common';

/**
 * Build a mock fluent-ffmpeg chain.
 *
 * `on(event, cb)` stores the callback: either the `error` or `end` handler.
 * `save(path)` calls the appropriate end-of-stream callback:
 *  - on success by default
 *  - on error if `shouldFail` is true
 */
function buildChain(opts: { shouldFail?: boolean; errorMsg?: string; onSave?: (path: string) => void } = {}) {
  const handler: { error?: (err: Error) => void; end?: () => void } = {};
  const chain = {
    size: jest.fn().mockReturnThis(),
    videoCodec: jest.fn().mockReturnThis(),
    audioCodec: jest.fn().mockReturnThis(),
    toFormat: jest.fn().mockReturnThis(),
    seekInput: jest.fn().mockReturnThis(),
    frames: jest.fn().mockReturnThis(),
    on: jest.fn().mockImplementation((event: string, cb: Function) => {
      if (event === 'error') handler.error = cb as (err: Error) => void;
      if (event === 'end') handler.end = cb as () => void;
      return chain;
    }),
    save: jest.fn().mockImplementation((path: string) => {
      opts.onSave?.(path);
      if (opts.shouldFail) {
        handler.error?.(new Error(opts.errorMsg ?? 'mock error'));
      } else {
        handler.end?.();
      }
    }),
    handler,
  };
  return chain;
}

// Mutable refs that the mock factory reads.
let chainFactory = () => buildChain();
let ffprobeImpl: jest.Mock = jest.fn();

jest.mock('fluent-ffmpeg', () => {
  const factory = () => chainFactory();
  (factory as any).ffprobe = (...args: any[]) => ffprobeImpl(...args);
  (factory as any).__esModule = true;
  (factory as any).default = factory;
  return factory as any;
});

jest.mock('fs', () => ({
  promises: {
    access: jest.fn().mockResolvedValue(undefined),
    mkdir: jest.fn().mockResolvedValue(undefined),
  },
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
}));

describe('VideoProcessingService', () => {
  let service: VideoProcessingService;

  beforeEach(() => {
    service = new VideoProcessingService();
    chainFactory = () => buildChain();
    ffprobeImpl = jest.fn();
    jest.clearAllMocks();
  });

  describe('transcode', () => {
    it('transcodes to 720p and 1080p mp4 by default', async () => {
      const chains: any[] = [];
      chainFactory = () => {
        const c = buildChain();
        chains.push(c);
        return c;
      };
      const result = await service.transcode('/tmp/video.mp4', {
        resolutions: ['720p', '1080p'],
        format: 'mp4',
      });
      expect(result).toContain('_transcoded');
      expect(chains.length).toBe(2);
      expect(chains[0].size).toHaveBeenCalledWith('1280x720');
      expect(chains[1].size).toHaveBeenCalledWith('1920x1080');
      expect(chains[0].videoCodec).toHaveBeenCalledWith('libx264');
      expect(chains[0].audioCodec).toHaveBeenCalledWith('aac');
      expect(chains[0].toFormat).toHaveBeenCalledWith('mp4');
    });

    it('transcodes to webm with vpx/vorbis codecs', async () => {
      const chains: any[] = [];
      chainFactory = () => {
        const c = buildChain();
        chains.push(c);
        return c;
      };
      const result = await service.transcode('/tmp/video.mp4', {
        resolutions: ['720p'],
        format: 'webm',
      });
      expect(result).toContain('_transcoded');
      expect(chains.length).toBe(1);
      expect(chains[0].videoCodec).toHaveBeenCalledWith('libvpx');
      expect(chains[0].audioCodec).toHaveBeenCalledWith('libvorbis');
      expect(chains[0].toFormat).toHaveBeenCalledWith('webm');
    });

    it('throws when input file does not exist', async () => {
      const fs = require('fs');
      fs.promises.access.mockRejectedValueOnce(new Error('ENOENT'));
      await expect(
        service.transcode('/tmp/nope.mp4', { resolutions: ['720p'], format: 'mp4' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when ffmpeg errors', async () => {
      chainFactory = () => buildChain({ shouldFail: true, errorMsg: 'codec not found' });
      await expect(
        service.transcode('/tmp/video.mp4', { resolutions: ['720p'], format: 'mp4' }),
      ).rejects.toThrow('Transcode failed: codec not found');
    });
  });

  describe('extractCover', () => {
    it('seeks to the given timestamp and saves a single frame', async () => {
      let savedChain: any;
      chainFactory = () => {
        const c = buildChain();
        savedChain = c;
        return c;
      };
      const result = await service.extractCover('/tmp/video.mp4', 30);
      expect(savedChain.seekInput).toHaveBeenCalledWith(30);
      expect(savedChain.frames).toHaveBeenCalledWith(1);
      expect(result).toMatch(/_cover\.jpg$/);
    });

    it('throws when input file does not exist', async () => {
      const fs = require('fs');
      fs.promises.access.mockRejectedValueOnce(new Error('ENOENT'));
      await expect(service.extractCover('/tmp/nope.mp4', 10)).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when ffmpeg errors', async () => {
      chainFactory = () => buildChain({ shouldFail: true, errorMsg: 'seek failed' });
      await expect(
        service.extractCover('/tmp/video.mp4', 5),
      ).rejects.toThrow('Cover extraction failed: seek failed');
    });
  });

  describe('getMetadata', () => {
    it('returns duration, resolution, and codec from ffprobe', async () => {
      ffprobeImpl = jest.fn((_path: string, cb: Function) => {
        cb(null, {
          format: { duration: 120.5 },
          streams: [{ codec_type: 'video', width: 1920, height: 1080, codec_name: 'h264' }],
        });
      });
      const result = await service.getMetadata('/tmp/video.mp4');
      expect(result).toEqual({ duration: 120.5, width: 1920, height: 1080, codec: 'h264' });
    });

    it('returns 0/empty values when no video stream is present', async () => {
      ffprobeImpl = jest.fn((_path: string, cb: Function) => {
        cb(null, { format: {}, streams: [{ codec_type: 'audio', codec_name: 'aac' }] });
      });
      const result = await service.getMetadata('/tmp/video.mp4');
      expect(result).toEqual({ duration: 0, width: 0, height: 0, codec: '' });
    });

    it('throws BadRequestException when ffprobe errors', async () => {
      ffprobeImpl = jest.fn((_path: string, cb: Function) => {
        cb(new Error('probe failed'), null);
      });
      await expect(service.getMetadata('/tmp/video.mp4')).rejects.toThrow('Metadata probe failed: probe failed');
    });

    it('throws when input file does not exist', async () => {
      const fs = require('fs');
      fs.promises.access.mockRejectedValueOnce(new Error('ENOENT'));
      await expect(service.getMetadata('/tmp/nope.mp4')).rejects.toThrow(NotFoundException);
    });
  });
});
