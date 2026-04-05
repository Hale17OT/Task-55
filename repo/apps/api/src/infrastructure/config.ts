import { z } from 'zod';

const INSECURE_JWT_SECRET = 'dev_jwt_secret_change_me_at_least_32_characters_long';
const INSECURE_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

const configSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  CORS_ORIGIN: z.string().default('http://localhost:4200'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  ENCRYPTION_KEY: z.string().length(64, 'ENCRYPTION_KEY must be 64 hex characters (32 bytes)').regex(/^[0-9a-fA-F]{64}$/, 'ENCRYPTION_KEY must contain only hex characters (0-9, a-f)'),
  STORAGE_ROOT: z.string().default('./data/media'),
});

export type AppConfig = z.infer<typeof configSchema>;

export function parseConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const nodeEnv = env.NODE_ENV || 'development';

  // In test/development, allow insecure defaults so local dev and tests work without .env
  const effectiveEnv = { ...env };
  if (nodeEnv === 'test' || nodeEnv === 'development') {
    if (!effectiveEnv.JWT_SECRET) effectiveEnv.JWT_SECRET = INSECURE_JWT_SECRET;
    if (!effectiveEnv.ENCRYPTION_KEY) effectiveEnv.ENCRYPTION_KEY = INSECURE_ENCRYPTION_KEY;
  }

  const result = configSchema.safeParse(effectiveEnv);
  if (!result.success) {
    const errors = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  }

  // In production, reject known insecure secrets — hard failure
  if (nodeEnv === 'production') {
    if (result.data.JWT_SECRET === INSECURE_JWT_SECRET) {
      throw new Error('SECURITY: JWT_SECRET must be changed from the default value in production');
    }
    if (result.data.ENCRYPTION_KEY === INSECURE_ENCRYPTION_KEY) {
      throw new Error('SECURITY: ENCRYPTION_KEY must be changed from the default value in production');
    }
  }

  // In development, warn loudly when using insecure defaults
  if (nodeEnv === 'development') {
    if (result.data.JWT_SECRET === INSECURE_JWT_SECRET || result.data.ENCRYPTION_KEY === INSECURE_ENCRYPTION_KEY) {
      console.warn('');
      console.warn('╔══════════════════════════════════════════════════════════════════════╗');
      console.warn('║  WARNING: Running with INSECURE default secrets.                     ║');
      console.warn('║  Set JWT_SECRET and ENCRYPTION_KEY in .env for any non-local use.    ║');
      console.warn('║  In production (NODE_ENV=production), insecure defaults are rejected. ║');
      console.warn('╚══════════════════════════════════════════════════════════════════════╝');
      console.warn('');
    }
  }

  return result.data;
}
