import sharp from 'sharp';
import { join, dirname } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { MEDIA } from '@studioops/shared';

export interface ImageProcessingResult {
  processedPath: string;
  previewPath: string;
  width: number;
  height: number;
}

export async function processImage(
  inputPath: string,
  outputDir: string,
  fileId: string,
): Promise<ImageProcessingResult> {
  const processedPath = join(outputDir, 'processed', `${fileId}.jpg`);
  const previewPath = join(outputDir, 'previews', `${fileId}.jpg`);

  await mkdir(dirname(processedPath), { recursive: true });
  await mkdir(dirname(previewPath), { recursive: true });

  // Process main image: resize to max 3000px long edge, JPEG quality 80
  const metadata = await sharp(inputPath).metadata();
  const { width: origW = 0, height: origH = 0 } = metadata;

  let resizeOpts: sharp.ResizeOptions | undefined;
  const longEdge = Math.max(origW, origH);
  if (longEdge > MEDIA.PHOTO_MAX_LONG_EDGE) {
    if (origW >= origH) {
      resizeOpts = { width: MEDIA.PHOTO_MAX_LONG_EDGE, withoutEnlargement: true };
    } else {
      resizeOpts = { height: MEDIA.PHOTO_MAX_LONG_EDGE, withoutEnlargement: true };
    }
  }

  const processed = sharp(inputPath);
  if (resizeOpts) processed.resize(resizeOpts);
  const processedInfo = await processed
    .jpeg({ quality: MEDIA.PHOTO_JPEG_QUALITY })
    .toFile(processedPath);

  // Generate preview thumbnail: 400px
  await sharp(inputPath)
    .resize({ width: MEDIA.PHOTO_PREVIEW_SIZE, withoutEnlargement: true })
    .jpeg({ quality: 70 })
    .toFile(previewPath);

  return {
    processedPath,
    previewPath,
    width: processedInfo.width,
    height: processedInfo.height,
  };
}
