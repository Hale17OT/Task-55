import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { processImage } from '../../src/infrastructure/media/image-processor';

describe('processImage', () => {
  let workDir: string;

  beforeAll(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'img-proc-'));
  });

  afterAll(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it('processes a small image (no resize branch)', async () => {
    const input = join(workDir, 'small.jpg');
    await sharp({ create: { width: 200, height: 200, channels: 3, background: { r: 255, g: 0, b: 0 } } })
      .jpeg()
      .toFile(input);

    const result = await processImage(input, workDir, 'small-id');
    expect(result.processedPath).toContain('small-id.jpg');
    expect(result.previewPath).toContain('small-id.jpg');
    expect(result.width).toBe(200);
    expect(result.height).toBe(200);
  });

  it('resizes a wide image down to PHOTO_MAX_LONG_EDGE (width branch)', async () => {
    const input = join(workDir, 'wide.jpg');
    await sharp({ create: { width: 4000, height: 2000, channels: 3, background: { r: 0, g: 255, b: 0 } } })
      .jpeg()
      .toFile(input);

    const result = await processImage(input, workDir, 'wide-id');
    expect(result.width).toBeLessThanOrEqual(3000);
    expect(result.height).toBeLessThanOrEqual(3000);
  });

  it('resizes a tall image down to PHOTO_MAX_LONG_EDGE (height branch)', async () => {
    const input = join(workDir, 'tall.jpg');
    await sharp({ create: { width: 2000, height: 4000, channels: 3, background: { r: 0, g: 0, b: 255 } } })
      .jpeg()
      .toFile(input);

    const result = await processImage(input, workDir, 'tall-id');
    expect(result.height).toBeLessThanOrEqual(3000);
  });
});
