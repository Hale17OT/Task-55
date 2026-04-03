import ffmpeg from 'fluent-ffmpeg';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { MEDIA } from '@studioops/shared';

export interface VideoProcessingResult {
  processedPath: string;
  previewPath: string;
  width: number;
  height: number;
  durationSeconds: number;
}

/**
 * Check if FFmpeg is available at startup.
 * Logs a warning if missing — video upload will still accept files but processing will fail.
 */
let ffmpegAvailable: boolean | null = null;
export function checkFfmpegAvailable(): boolean {
  if (ffmpegAvailable !== null) return ffmpegAvailable;
  try {
    execSync('ffmpeg -version', { stdio: 'ignore' });
    execSync('ffprobe -version', { stdio: 'ignore' });
    ffmpegAvailable = true;
  } catch {
    ffmpegAvailable = false;
  }
  return ffmpegAvailable;
}

export async function processVideo(
  inputPath: string,
  outputDir: string,
  fileId: string,
): Promise<VideoProcessingResult> {
  if (!checkFfmpegAvailable()) {
    throw new Error('FFmpeg/FFprobe not found. Install FFmpeg to enable video processing. See README prerequisites.');
  }

  const processedPath = join(outputDir, 'processed', `${fileId}.mp4`);
  const previewPath = join(outputDir, 'previews', `${fileId}.jpg`);

  await mkdir(dirname(processedPath), { recursive: true });
  await mkdir(dirname(previewPath), { recursive: true });

  // Get input metadata
  const metadata = await new Promise<ffmpeg.FfprobeData>((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, (err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  });

  const videoStream = metadata.streams.find(s => s.codec_type === 'video');
  const inputHeight = videoStream?.height ?? 0;
  const inputWidth = videoStream?.width ?? 0;
  const duration = metadata.format.duration ?? 0;

  // Determine if downscale is needed (cap at 1080p)
  const needsDownscale = inputHeight > MEDIA.VIDEO_MAX_HEIGHT;
  const scaleFilter = needsDownscale
    ? `-vf scale=-2:${MEDIA.VIDEO_MAX_HEIGHT}`
    : '';

  // Transcode to H.264 at 1080p max
  await new Promise<void>((resolve, reject) => {
    let cmd = ffmpeg(inputPath)
      .videoCodec('libx264')
      .audioCodec('aac')
      .outputOptions(['-preset', 'fast', '-crf', '23', '-movflags', '+faststart']);

    if (needsDownscale) {
      cmd = cmd.videoFilter(`scale=-2:${MEDIA.VIDEO_MAX_HEIGHT}`);
    }

    cmd.output(processedPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run();
  });

  // Extract poster frame (at 1 second or 10% of duration)
  const seekTime = Math.min(1, duration * 0.1);
  await new Promise<void>((resolve, reject) => {
    ffmpeg(inputPath)
      .seekInput(seekTime)
      .frames(1)
      .output(previewPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run();
  });

  // Get output dimensions
  const outputMeta = await new Promise<ffmpeg.FfprobeData>((resolve, reject) => {
    ffmpeg.ffprobe(processedPath, (err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  });

  const outputVideo = outputMeta.streams.find(s => s.codec_type === 'video');

  return {
    processedPath,
    previewPath,
    width: outputVideo?.width ?? inputWidth,
    height: outputVideo?.height ?? Math.min(inputHeight, MEDIA.VIDEO_MAX_HEIGHT),
    durationSeconds: Math.round(duration),
  };
}
