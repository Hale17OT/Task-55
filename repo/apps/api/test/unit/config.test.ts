import { describe, it, expect } from 'vitest';
import { parseConfig } from '../../src/infrastructure/config.js';

describe('parseConfig', () => {
  const validEnv = {
    DATABASE_URL: 'postgres://user:pass@localhost:5432/studioops',
    JWT_SECRET: 'a_jwt_secret_that_is_at_least_32_characters_long!!',
    ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  };

  it('throws when DATABASE_URL is missing', () => {
    expect(() => parseConfig({})).toThrow('DATABASE_URL');
  });

  it('throws when DATABASE_URL is empty', () => {
    expect(() => parseConfig({ DATABASE_URL: '' })).toThrow('DATABASE_URL');
  });

  it('defaults LOG_LEVEL to info when omitted', () => {
    const config = parseConfig(validEnv);
    expect(config.LOG_LEVEL).toBe('info');
  });

  it('defaults PORT to 3000 when omitted', () => {
    const config = parseConfig(validEnv);
    expect(config.PORT).toBe(3000);
  });

  it('defaults NODE_ENV to development when omitted', () => {
    const config = parseConfig(validEnv);
    expect(config.NODE_ENV).toBe('development');
  });

  it('parses PORT as integer from string', () => {
    const config = parseConfig({ ...validEnv, PORT: '8080' });
    expect(config.PORT).toBe(8080);
  });

  it('accepts valid LOG_LEVEL values', () => {
    for (const level of ['debug', 'info', 'warn', 'error'] as const) {
      const config = parseConfig({ ...validEnv, LOG_LEVEL: level });
      expect(config.LOG_LEVEL).toBe(level);
    }
  });

  it('rejects invalid LOG_LEVEL', () => {
    expect(() => parseConfig({ ...validEnv, LOG_LEVEL: 'trace' })).toThrow();
  });

  it('returns complete config for valid env', () => {
    const config = parseConfig(validEnv);
    expect(config.DATABASE_URL).toBe(validEnv.DATABASE_URL);
    expect(config.CORS_ORIGIN).toBe('http://localhost:4200');
    expect(config.STORAGE_ROOT).toBe('./data/media');
  });

  it('throws when JWT_SECRET is too short', () => {
    expect(() => parseConfig({ ...validEnv, JWT_SECRET: 'short' })).toThrow('JWT_SECRET');
  });

  it('throws when ENCRYPTION_KEY is wrong length', () => {
    expect(() => parseConfig({ ...validEnv, ENCRYPTION_KEY: 'tooshort' })).toThrow('ENCRYPTION_KEY');
  });

  it('provides insecure defaults in development when secrets are omitted', () => {
    const config = parseConfig({ DATABASE_URL: validEnv.DATABASE_URL, NODE_ENV: 'development' });
    expect(config.JWT_SECRET).toBeDefined();
    expect(config.ENCRYPTION_KEY).toBeDefined();
  });

  it('provides insecure defaults in test when secrets are omitted', () => {
    const config = parseConfig({ DATABASE_URL: validEnv.DATABASE_URL, NODE_ENV: 'test' });
    expect(config.JWT_SECRET).toBeDefined();
    expect(config.ENCRYPTION_KEY).toBeDefined();
  });

  it('throws in production when JWT_SECRET is missing', () => {
    expect(() => parseConfig({
      DATABASE_URL: validEnv.DATABASE_URL,
      NODE_ENV: 'production',
      ENCRYPTION_KEY: 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
    })).toThrow('JWT_SECRET');
  });

  it('throws in production when ENCRYPTION_KEY is missing', () => {
    expect(() => parseConfig({
      DATABASE_URL: validEnv.DATABASE_URL,
      NODE_ENV: 'production',
      JWT_SECRET: 'a_production_jwt_secret_at_least_32_chars!!',
    })).toThrow('ENCRYPTION_KEY');
  });

  it('throws in production when JWT_SECRET is the insecure default', () => {
    expect(() => parseConfig({
      DATABASE_URL: validEnv.DATABASE_URL,
      NODE_ENV: 'production',
      JWT_SECRET: 'dev_jwt_secret_change_me_at_least_32_characters_long',
      ENCRYPTION_KEY: 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
    })).toThrow('SECURITY');
  });

  it('throws in production when ENCRYPTION_KEY is the insecure default', () => {
    expect(() => parseConfig({
      DATABASE_URL: validEnv.DATABASE_URL,
      NODE_ENV: 'production',
      JWT_SECRET: 'a_production_jwt_secret_at_least_32_chars!!',
      ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    })).toThrow('SECURITY');
  });

  it('accepts valid production config with non-default secrets', () => {
    const config = parseConfig({
      DATABASE_URL: validEnv.DATABASE_URL,
      NODE_ENV: 'production',
      JWT_SECRET: 'a_production_jwt_secret_at_least_32_chars!!',
      ENCRYPTION_KEY: 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
    });
    expect(config.NODE_ENV).toBe('production');
  });
});
