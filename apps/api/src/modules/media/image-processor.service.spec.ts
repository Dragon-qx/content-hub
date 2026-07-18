import sharp from 'sharp';
import { ImageProcessorService } from './image-processor.service';

describe('ImageProcessorService', () => {
  let service: ImageProcessorService;

  beforeEach(() => {
    service = new ImageProcessorService();
  });

  it('resizes and returns a buffer', async () => {
    const input = await createTestPng(100, 100);
    const result = await service.process(input, { resize: { width: 50, height: 50 } });
    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it('applies grayscale filter', async () => {
    const input = await createTestPng(50, 50);
    const result = await service.process(input, { filter: 'grayscale' });
    expect(result.length).toBeGreaterThan(0);
  });

  it('applies crop', async () => {
    const input = await createTestPng(100, 100);
    const result = await service.process(input, {
      crop: { left: 10, top: 10, width: 50, height: 50 },
    });
    expect(result.length).toBeGreaterThan(0);
  });
});

/** Makes a tiny solid-color PNG for tests without any external dependency. */
async function createTestPng(w: number, h: number): Promise<Buffer> {
  const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><rect width="${w}" height="${h}" fill="red"/></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}
