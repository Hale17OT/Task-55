import { describe, it, expect } from 'vitest';
import { computeFilterHash, safeRatio, validateDateRange } from '../../src/core/domain/analytics';

describe('computeFilterHash', () => {
  it('returns consistent hash for same filters', () => {
    const filters = { from: new Date('2026-01-01'), to: new Date('2026-01-31') };
    expect(computeFilterHash(filters)).toBe(computeFilterHash(filters));
  });

  it('returns different hash for different filters', () => {
    const a = { from: new Date('2026-01-01'), to: new Date('2026-01-31') };
    const b = { from: new Date('2026-02-01'), to: new Date('2026-02-28') };
    expect(computeFilterHash(a)).not.toBe(computeFilterHash(b));
  });

  it('returns 16-char hex string', () => {
    const hash = computeFilterHash({ from: new Date(), to: new Date() });
    expect(hash.length).toBe(16);
    expect(/^[a-f0-9]+$/.test(hash)).toBe(true);
  });
});

describe('safeRatio', () => {
  it('computes correct ratio', () => {
    expect(safeRatio(50, 100)).toBe(0.5);
    expect(safeRatio(75, 100)).toBe(0.75);
  });

  it('returns 0 when denominator is 0 (zero-division safe)', () => {
    expect(safeRatio(50, 0)).toBe(0);
  });

  it('returns 1 for equal values', () => {
    expect(safeRatio(100, 100)).toBe(1);
  });

  it('rounds to 4 decimal places', () => {
    const result = safeRatio(1, 3);
    expect(result).toBe(0.3333);
  });
});

describe('validateDateRange', () => {
  it('accepts valid range (from < to)', () => {
    const result = validateDateRange(new Date('2026-01-01'), new Date('2026-01-31'));
    expect(result.valid).toBe(true);
  });

  it('rejects invalid range (from > to)', () => {
    const result = validateDateRange(new Date('2026-02-01'), new Date('2026-01-01'));
    expect(result.valid).toBe(false);
    expect(result.error).toContain('before');
  });

  it('accepts same date', () => {
    const d = new Date('2026-01-01');
    expect(validateDateRange(d, d).valid).toBe(true);
  });
});
