import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './specs',
  timeout: 30000,
  retries: 1,
  workers: 1,
  fullyParallel: false,
  use: {
    baseURL: process.env.API_URL || 'http://localhost:3100',
  },
  reporter: [['html', { open: 'never' }], ['list']],
  projects: [
    {
      name: 'api',
      testMatch: /^(?!.*browser-).*\.spec\.ts$/,
    },
    {
      name: 'browser',
      testMatch: /browser-.*\.spec\.ts$/,
      use: {
        baseURL: process.env.APP_URL || 'http://localhost:4200',
        // Use system Chromium in Docker (set via PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH)
        ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
          ? { channel: undefined, launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } }
          : {}),
      },
    },
  ],
});
