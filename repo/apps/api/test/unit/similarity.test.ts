import { describe, it, expect } from 'vitest';
import {
  levenshteinRatio,
  numericSimilarity,
  jaccardIndex,
  computeSimilarity,
} from '../../src/core/domain/similarity';

describe('levenshteinRatio', () => {
  it('returns 1.0 for identical strings', () => {
    expect(levenshteinRatio('wedding', 'wedding')).toBe(1);
  });

  it('returns 0 for completely different strings', () => {
    expect(levenshteinRatio('abc', 'xyz')).toBe(0);
  });

  it('returns high ratio for similar strings', () => {
    const ratio = levenshteinRatio('Wedding Photography', 'Wedding Photograpy');
    expect(ratio).toBeGreaterThan(0.9);
  });

  it('returns low ratio for dissimilar strings', () => {
    const ratio = levenshteinRatio('Wedding Photography', 'Corporate Headshots');
    expect(ratio).toBeLessThan(0.5);
  });

  it('is case-insensitive', () => {
    expect(levenshteinRatio('WEDDING', 'wedding')).toBe(1);
  });

  it('handles empty strings', () => {
    expect(levenshteinRatio('', '')).toBe(1);
    expect(levenshteinRatio('abc', '')).toBe(0);
  });
});

describe('numericSimilarity', () => {
  it('returns 1.0 for identical values', () => {
    expect(numericSimilarity(100, 100)).toBe(1);
  });

  it('returns 0 when one is 0 and other is non-zero', () => {
    expect(numericSimilarity(0, 100)).toBe(0);
  });

  it('returns high similarity for close values', () => {
    expect(numericSimilarity(250000, 245000)).toBeGreaterThan(0.95);
  });

  it('returns low similarity for distant values', () => {
    expect(numericSimilarity(100, 1000)).toBeLessThan(0.2);
  });

  it('handles both zeros', () => {
    expect(numericSimilarity(0, 0)).toBe(1);
  });
});

describe('jaccardIndex', () => {
  it('returns 1.0 for identical sets', () => {
    expect(jaccardIndex(['wedding', 'outdoor'], ['wedding', 'outdoor'])).toBe(1);
  });

  it('returns 0 for completely disjoint sets', () => {
    expect(jaccardIndex(['wedding'], ['corporate'])).toBe(0);
  });

  it('returns correct value for overlapping sets', () => {
    // {wedding, outdoor} ∩ {wedding, indoor} = {wedding}
    // |intersection| = 1, |union| = 3
    expect(jaccardIndex(['wedding', 'outdoor'], ['wedding', 'indoor'])).toBeCloseTo(1 / 3, 2);
  });

  it('handles empty sets', () => {
    expect(jaccardIndex([], [])).toBe(1);
    expect(jaccardIndex(['a'], [])).toBe(0);
  });

  it('is case-insensitive', () => {
    expect(jaccardIndex(['WEDDING'], ['wedding'])).toBe(1);
  });

  it('computes 80% overlap correctly', () => {
    // {a,b,c,d,e} ∩ {a,b,c,d,f} = {a,b,c,d} → |4|/|6| = 0.667
    const result = jaccardIndex(['a', 'b', 'c', 'd', 'e'], ['a', 'b', 'c', 'd', 'f']);
    expect(result).toBeCloseTo(4 / 6, 2);
  });
});

describe('computeSimilarity', () => {
  it('returns high score for near-identical records', () => {
    const result = computeSimilarity({
      titleA: 'Wedding Photography Package',
      titleB: 'Wedding Photography Packag',
      priceA: 250000,
      priceB: 250000,
      durationA: 360,
      durationB: 360,
      tagsA: ['wedding', 'outdoor'],
      tagsB: ['wedding', 'outdoor'],
    });

    expect(result.compositeScore).toBeGreaterThan(0.95);
    expect(result.isDuplicate).toBe(true);
  });

  it('returns score above 0.85 for near-duplicates', () => {
    const result = computeSimilarity({
      titleA: 'Wedding Essentials',
      titleB: 'Wedding Essential',
      priceA: 250000,
      priceB: 250000,
      durationA: 360,
      durationB: 360,
      tagsA: ['wedding', 'outdoor', 'portrait'],
      tagsB: ['wedding', 'outdoor'],
    });

    expect(result.compositeScore).toBeGreaterThanOrEqual(0.85);
    expect(result.isDuplicate).toBe(true);
  });

  it('returns score below 0.85 for different records', () => {
    const result = computeSimilarity({
      titleA: 'Wedding Photography',
      titleB: 'Corporate Headshots',
      priceA: 250000,
      priceB: 45000,
      durationA: 360,
      durationB: 90,
      tagsA: ['wedding', 'outdoor'],
      tagsB: ['corporate', 'studio'],
    });

    expect(result.compositeScore).toBeLessThan(0.85);
    expect(result.isDuplicate).toBe(false);
  });

  it('returns individual feature scores', () => {
    const result = computeSimilarity({
      titleA: 'Test', titleB: 'Test',
      priceA: 100, priceB: 100,
      durationA: 60, durationB: 60,
      tagsA: ['a'], tagsB: ['a'],
    });

    expect(result.featureScores.title).toBe(1);
    expect(result.featureScores.price).toBe(1);
    expect(result.featureScores.duration).toBe(1);
    expect(result.featureScores.tags).toBe(1);
    expect(result.compositeScore).toBe(1);
  });

  it('weights are applied correctly (title=0.40, price=0.25, duration=0.15, tags=0.20)', () => {
    // Only title matches (1.0), everything else is 0
    const result = computeSimilarity({
      titleA: 'Same Title', titleB: 'Same Title',
      priceA: 0, priceB: 100000,
      durationA: 0, durationB: 500,
      tagsA: ['a'], tagsB: ['z'],
    });

    // Title score = 1.0, weight = 0.40
    expect(result.compositeScore).toBeCloseTo(0.40, 1);
  });
});
