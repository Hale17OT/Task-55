import { describe, it, expect } from 'vitest';
import { createRuleSchema, updateRolePermissionsSchema, revealConfigSchema } from '@studioops/shared';

describe('createRuleSchema', () => {
  it('accepts valid rule', () => {
    const result = createRuleSchema.safeParse({
      ruleKey: 'daily_upload_limit',
      config: { limit: 20, window: 'day' },
      effectiveFrom: '2026-04-01T00:00:00Z',
      canaryPercent: 100,
    });
    expect(result.success).toBe(true);
  });

  it('rejects canary > 100', () => {
    const result = createRuleSchema.safeParse({
      ruleKey: 'test', config: { limit: 10, window: 'hour' },
      effectiveFrom: '2026-04-01T00:00:00Z', canaryPercent: 101,
    });
    expect(result.success).toBe(false);
  });

  it('rejects canary < 0', () => {
    const result = createRuleSchema.safeParse({
      ruleKey: 'test', config: { limit: 10, window: 'hour' },
      effectiveFrom: '2026-04-01T00:00:00Z', canaryPercent: -1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid effectiveFrom', () => {
    const result = createRuleSchema.safeParse({
      ruleKey: 'test', config: { limit: 10, window: 'hour' },
      effectiveFrom: 'not-a-date', canaryPercent: 50,
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid window value', () => {
    const result = createRuleSchema.safeParse({
      ruleKey: 'test', config: { limit: 10, window: 'week' },
      effectiveFrom: '2026-04-01T00:00:00Z',
    });
    expect(result.success).toBe(false);
  });

  it('defaults canaryPercent to 100', () => {
    const result = createRuleSchema.parse({
      ruleKey: 'test', config: { limit: 10, window: 'day' },
      effectiveFrom: '2026-04-01T00:00:00Z',
    });
    expect(result.canaryPercent).toBe(100);
  });

  it('accepts optional cooldownSeconds', () => {
    const result = createRuleSchema.safeParse({
      ruleKey: 'export_cooldown',
      config: { limit: 100, window: 'day', cooldownSeconds: 60 },
      effectiveFrom: '2026-04-01T00:00:00Z',
    });
    expect(result.success).toBe(true);
  });
});

describe('updateRolePermissionsSchema', () => {
  it('accepts valid permissions array', () => {
    const result = updateRolePermissionsSchema.safeParse({
      permissions: ['offering:read', 'offering:create'],
    });
    expect(result.success).toBe(true);
  });

  it('accepts empty permissions (remove all)', () => {
    const result = updateRolePermissionsSchema.safeParse({ permissions: [] });
    expect(result.success).toBe(true);
  });
});

describe('revealConfigSchema', () => {
  it('requires password', () => {
    const result = revealConfigSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects empty password', () => {
    const result = revealConfigSchema.safeParse({ password: '' });
    expect(result.success).toBe(false);
  });

  it('accepts valid password', () => {
    const result = revealConfigSchema.safeParse({ password: 'MyPassword123!@' });
    expect(result.success).toBe(true);
  });
});
