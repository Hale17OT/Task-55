import { describe, it, expect } from 'vitest';
import {
  normalizeCurrency,
  normalizeDuration,
  cmToInches,
  mmToInches,
  pixelsToInches,
  paperSizeToInches,
  detectOutlier,
} from '../../src/core/domain/normalizers';

describe('normalizeCurrency', () => {
  it('converts USD to cents (1:1)', () => {
    const result = normalizeCurrency(25.00, 'USD');
    expect(result.cents).toBe(2500);
    expect(result.flagged).toBe(false);
  });

  it('converts EUR to USD cents', () => {
    const result = normalizeCurrency(100, 'EUR');
    expect(result.cents).toBe(10800); // 100 * 1.08 * 100
    expect(result.flagged).toBe(false);
  });

  it('converts GBP to USD cents', () => {
    const result = normalizeCurrency(100, 'GBP');
    expect(result.cents).toBe(12700); // 100 * 1.27 * 100
  });

  it('converts JPY to USD cents', () => {
    const result = normalizeCurrency(10000, 'JPY');
    expect(result.cents).toBe(6700); // 10000 * 0.0067 * 100
  });

  it('flags unknown currency', () => {
    const result = normalizeCurrency(100, 'XYZ');
    expect(result.flagged).toBe(true);
    expect(result.flagReason).toContain('XYZ');
  });

  it('handles case-insensitive currency codes', () => {
    const result = normalizeCurrency(50, 'eur');
    expect(result.cents).toBe(5400);
    expect(result.flagged).toBe(false);
  });
});

describe('normalizeDuration', () => {
  it('converts hours to minutes', () => {
    expect(normalizeDuration(2, 'hours')).toBe(120);
  });

  it('passes through minutes', () => {
    expect(normalizeDuration(90, 'minutes')).toBe(90);
  });

  it('converts seconds to minutes', () => {
    expect(normalizeDuration(180, 'seconds')).toBe(3);
  });

  it('handles zero', () => {
    expect(normalizeDuration(0, 'hours')).toBe(0);
  });
});

describe('Dimension normalization', () => {
  it('converts cm to inches', () => {
    expect(cmToInches(2.54)).toBeCloseTo(1.0, 2);
    expect(cmToInches(21.0)).toBeCloseTo(8.27, 1);
  });

  it('converts mm to inches', () => {
    expect(mmToInches(25.4)).toBeCloseTo(1.0, 2);
  });

  it('converts pixels to inches at 300 DPI', () => {
    expect(pixelsToInches(3000)).toBeCloseTo(10.0, 2);
    expect(pixelsToInches(2000)).toBeCloseTo(6.667, 1);
  });

  it('converts pixels at custom DPI', () => {
    expect(pixelsToInches(150, 150)).toBeCloseTo(1.0, 2);
  });
});

describe('paperSizeToInches', () => {
  it('resolves A4 to correct dimensions', () => {
    const a4 = paperSizeToInches('A4');
    expect(a4).not.toBeNull();
    expect(a4!.widthInches).toBeCloseTo(8.27, 1);
    expect(a4!.heightInches).toBeCloseTo(11.69, 1);
  });

  it('resolves A3', () => {
    const a3 = paperSizeToInches('A3');
    expect(a3).not.toBeNull();
    expect(a3!.widthInches).toBeCloseTo(11.69, 1);
  });

  it('resolves US Letter', () => {
    const letter = paperSizeToInches('Letter');
    expect(letter).not.toBeNull();
    expect(letter!.widthInches).toBe(8.5);
    expect(letter!.heightInches).toBe(11);
  });

  it('resolves US Legal', () => {
    const legal = paperSizeToInches('Legal');
    expect(legal).not.toBeNull();
    expect(legal!.heightInches).toBe(14);
  });

  it('resolves US Tabloid', () => {
    const tabloid = paperSizeToInches('Tabloid');
    expect(tabloid).not.toBeNull();
    expect(tabloid!.widthInches).toBe(11);
    expect(tabloid!.heightInches).toBe(17);
  });

  it('returns null for unknown size', () => {
    expect(paperSizeToInches('Unknown')).toBeNull();
  });

  it('has A0 through A10', () => {
    for (let i = 0; i <= 10; i++) {
      expect(paperSizeToInches(`A${i}`)).not.toBeNull();
    }
  });

  it('has B0 through B5', () => {
    for (let i = 0; i <= 5; i++) {
      expect(paperSizeToInches(`B${i}`)).not.toBeNull();
    }
  });
});

describe('detectOutlier', () => {
  it('flags value at 11x median', () => {
    const result = detectOutlier(1100, 100);
    expect(result.isOutlier).toBe(true);
    expect(result.ratio).toBe(11);
  });

  it('does not flag value at 9x median', () => {
    const result = detectOutlier(900, 100);
    expect(result.isOutlier).toBe(false);
    expect(result.ratio).toBe(9);
  });

  it('flags extremely low value (0.05x median)', () => {
    const result = detectOutlier(5, 100);
    expect(result.isOutlier).toBe(true);
  });

  it('does not flag value at 0.2x median', () => {
    const result = detectOutlier(20, 100);
    expect(result.isOutlier).toBe(false);
  });

  it('handles zero median without error', () => {
    const result = detectOutlier(100, 0);
    expect(result.isOutlier).toBe(false);
  });

  it('flags at exactly 10x threshold by default', () => {
    // 10x is not outlier (> threshold means strictly greater)
    const result = detectOutlier(1000, 100);
    expect(result.isOutlier).toBe(false); // exactly 10x, not > 10x
  });
});
