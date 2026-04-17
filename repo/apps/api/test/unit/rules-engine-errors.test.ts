import { describe, it, expect } from 'vitest';
import { QuotaExceededError, CooldownError } from '../../src/core/domain/rules-engine';

describe('QuotaExceededError', () => {
  it('captures the rule key, limit, current, and retryAfter', () => {
    const err = new QuotaExceededError('daily_upload_limit', 20, 21, 3600);
    expect(err.statusCode).toBe(429);
    expect(err.ruleKey).toBe('daily_upload_limit');
    expect(err.limit).toBe(20);
    expect(err.current).toBe(21);
    expect(err.retryAfter).toBe(3600);
    expect(err.message).toContain('daily_upload_limit');
    expect(err.name).toBe('QuotaExceededError');
    expect(err).toBeInstanceOf(Error);
  });
});

describe('CooldownError', () => {
  it('captures retryAfter and a generic message', () => {
    const err = new CooldownError(120);
    expect(err.statusCode).toBe(429);
    expect(err.retryAfter).toBe(120);
    expect(err.name).toBe('CooldownError');
    expect(err.message).toBe('Cooldown active');
    expect(err).toBeInstanceOf(Error);
  });
});
