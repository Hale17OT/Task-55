import { buildApp } from '../../src/app.js';
import type { AppConfig } from '../../src/infrastructure/config.js';
import type { FastifyInstance } from 'fastify';

const TEST_DB_URL = process.env.DATABASE_URL || 'postgres://studioops:dev_password_change_me@localhost:54320/studioops';

export function getTestConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    DATABASE_URL: TEST_DB_URL,
    PORT: 0,
    NODE_ENV: 'test',
    LOG_LEVEL: 'error',
    CORS_ORIGIN: 'http://localhost:4200',
    JWT_SECRET: 'test_jwt_secret_that_is_at_least_32_characters_long!!',
    ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    STORAGE_ROOT: './test-data/media',
    ...overrides,
  };
}

export async function createTestApp(configOverrides: Partial<AppConfig> = {}): Promise<FastifyInstance> {
  const config = getTestConfig(configOverrides);
  // Ensure env vars are set for plugins that read process.env directly
  process.env.ENCRYPTION_KEY = config.ENCRYPTION_KEY;
  process.env.STORAGE_ROOT = config.STORAGE_ROOT;
  const app = await buildApp({ config });
  return app;
}
