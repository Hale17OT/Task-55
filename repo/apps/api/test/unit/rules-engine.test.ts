import { describe, it, expect } from 'vitest';
import {
  isInCanary,
  resolveRuleVersion,
  getWindowSeconds,
  type RuleVersion,
} from '../../src/core/domain/rules-engine';

function makeRule(overrides: Partial<RuleVersion> = {}): RuleVersion {
  return {
    id: 'rule-1',
    ruleKey: 'daily_upload_limit',
    version: 1,
    config: { limit: 20, window: 'day' as const },
    effectiveFrom: new Date('2020-01-01'),
    effectiveTo: null,
    canaryPercent: 100,
    status: 'active',
    ...overrides,
  };
}

describe('isInCanary', () => {
  it('is deterministic for same userId + ruleId', () => {
    const a = isInCanary('user-1', 'rule-1', 50);
    const b = isInCanary('user-1', 'rule-1', 50);
    expect(a).toBe(b);
  });

  it('at 100% includes all users', () => {
    for (let i = 0; i < 20; i++) {
      expect(isInCanary(`user-${i}`, 'rule-1', 100)).toBe(true);
    }
  });

  it('at 0% excludes all users', () => {
    for (let i = 0; i < 20; i++) {
      expect(isInCanary(`user-${i}`, 'rule-1', 0)).toBe(false);
    }
  });

  it('at 50% includes roughly half of users', () => {
    let included = 0;
    const total = 1000;
    for (let i = 0; i < total; i++) {
      if (isInCanary(`user-${i}`, 'rule-1', 50)) included++;
    }
    // Allow 35%-65% range for statistical randomness
    expect(included).toBeGreaterThan(total * 0.35);
    expect(included).toBeLessThan(total * 0.65);
  });

  it('different ruleIds produce different buckets for same user', () => {
    // Not guaranteed to differ, but statistically likely for enough samples
    let differ = 0;
    for (let i = 0; i < 100; i++) {
      const a = isInCanary(`user-${i}`, 'rule-A', 50);
      const b = isInCanary(`user-${i}`, 'rule-B', 50);
      if (a !== b) differ++;
    }
    expect(differ).toBeGreaterThan(10); // At least some should differ
  });
});

describe('resolveRuleVersion', () => {
  it('selects latest effective active version', () => {
    const versions = [
      makeRule({ id: 'v2', version: 2, config: { limit: 10, window: 'day' } }),
      makeRule({ id: 'v1', version: 1, config: { limit: 20, window: 'day' } }),
    ];
    const result = resolveRuleVersion(versions, 'user-1');
    expect(result?.id).toBe('v2');
  });

  it('falls back to older version when user not in canary', () => {
    const versions = [
      makeRule({ id: 'v2', version: 2, canaryPercent: 0 }), // nobody in canary
      makeRule({ id: 'v1', version: 1, canaryPercent: 100 }), // everyone
    ];
    const result = resolveRuleVersion(versions, 'user-1');
    expect(result?.id).toBe('v1');
  });

  it('returns null when no version matches (all inactive)', () => {
    const versions = [
      makeRule({ status: 'deprecated' }),
    ];
    const result = resolveRuleVersion(versions, 'user-1');
    expect(result).toBeNull();
  });

  it('returns null when no version is effective yet', () => {
    const versions = [
      makeRule({ effectiveFrom: new Date('2099-01-01') }),
    ];
    const result = resolveRuleVersion(versions, 'user-1');
    expect(result).toBeNull();
  });

  it('skips expired versions', () => {
    const versions = [
      makeRule({ id: 'v2', effectiveTo: new Date('2020-01-01') }), // expired
      makeRule({ id: 'v1' }), // no expiry
    ];
    const result = resolveRuleVersion(versions, 'user-1');
    expect(result?.id).toBe('v1');
  });
});

describe('getWindowSeconds', () => {
  it('returns correct seconds for each window', () => {
    expect(getWindowSeconds('minute')).toBe(60);
    expect(getWindowSeconds('hour')).toBe(3600);
    expect(getWindowSeconds('day')).toBe(86400);
  });
});
