import { defineConfig } from 'vitest/config';

/**
 * Unified config that runs unit + integration in one process, so v8
 * coverage merges into a single accurate number. Used only for local
 * coverage measurement; CI still runs the two suites separately for
 * faster feedback.
 */
export default defineConfig({
  test: {
    include: ['test/unit/**/*.test.ts', 'test/integration/**/*.test.ts'],
    testTimeout: 90000,
    hookTimeout: 90000,
    globalSetup: ['test/helpers/integration-preflight.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/index.ts',
        'src/core/ports/**',
        // video-processor is a thin fluent-ffmpeg wrapper. The branches require
        // real video files which would make CI brittle; it is exercised
        // end-to-end via the /portfolio/upload route in integration tests.
        'src/infrastructure/media/video-processor.ts',
      ],
    },
  },
});
