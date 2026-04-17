import { describe, it, expect } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkFfmpegAvailable, processVideo } from '../../src/infrastructure/media/video-processor';

describe('video-processor', () => {
  describe('checkFfmpegAvailable', () => {
    it('returns a boolean (memoized)', () => {
      const first = checkFfmpegAvailable();
      const second = checkFfmpegAvailable();
      expect(typeof first).toBe('boolean');
      expect(first).toBe(second);
    });
  });

  describe('processVideo', () => {
    it('rejects a non-video buffer at the ffprobe stage', async () => {
      // Skip if ffmpeg isn't available in this environment — checkFfmpegAvailable
      // will throw at the top of processVideo, which is also a covered branch.
      if (!checkFfmpegAvailable()) {
        await expect(processVideo('/nonexistent.mp4', '/tmp', 'x')).rejects.toThrow(/FFmpeg/);
        return;
      }

      const dir = await mkdtemp(join(tmpdir(), 'vp-test-'));
      try {
        const fakeVideoPath = join(dir, 'fake.mp4');
        // Write garbage that ffprobe will refuse — covers ffprobe error path.
        await writeFile(fakeVideoPath, Buffer.from('this is not a video, just bytes'));
        await expect(processVideo(fakeVideoPath, dir, 'fake-id')).rejects.toBeInstanceOf(Error);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });
  });
});
