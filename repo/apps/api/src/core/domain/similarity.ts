import { DEDUP } from '@studioops/shared';

// --- Levenshtein distance ---

export function levenshteinDistance(a: string, b: string): number {
  const la = a.length;
  const lb = b.length;
  const matrix: number[][] = Array.from({ length: la + 1 }, (_, i) =>
    Array.from({ length: lb + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );

  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }

  return matrix[la][lb];
}

export function levenshteinRatio(a: string, b: string): number {
  if (a.length === 0 && b.length === 0) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshteinDistance(a.toLowerCase(), b.toLowerCase()) / maxLen;
}

// --- Numeric distance ---

export function numericSimilarity(a: number, b: number): number {
  if (a === 0 && b === 0) return 1;
  const maxVal = Math.max(Math.abs(a), Math.abs(b));
  if (maxVal === 0) return 1;
  return 1 - Math.abs(a - b) / maxVal;
}

// --- Jaccard index for tag sets ---

export function jaccardIndex(a: string[], b: string[]): number {
  const setA = new Set(a.map((s) => s.toLowerCase()));
  const setB = new Set(b.map((s) => s.toLowerCase()));

  if (setA.size === 0 && setB.size === 0) return 1;

  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }

  const union = setA.size + setB.size - intersection;
  if (union === 0) return 1;

  return intersection / union;
}

// --- Weighted composite similarity ---

export interface SimilarityInput {
  titleA: string;
  titleB: string;
  priceA: number;
  priceB: number;
  durationA: number;
  durationB: number;
  tagsA: string[];
  tagsB: string[];
}

export interface SimilarityResult {
  compositeScore: number;
  featureScores: {
    title: number;
    price: number;
    duration: number;
    tags: number;
  };
  isDuplicate: boolean;
}

export function computeSimilarity(input: SimilarityInput): SimilarityResult {
  const titleScore = levenshteinRatio(input.titleA, input.titleB);
  const priceScore = numericSimilarity(input.priceA, input.priceB);
  const durationScore = numericSimilarity(input.durationA, input.durationB);
  const tagsScore = jaccardIndex(input.tagsA, input.tagsB);

  const compositeScore =
    titleScore * DEDUP.WEIGHTS.TITLE +
    priceScore * DEDUP.WEIGHTS.PRICE +
    durationScore * DEDUP.WEIGHTS.DURATION +
    tagsScore * DEDUP.WEIGHTS.TAGS;

  return {
    compositeScore,
    featureScores: {
      title: titleScore,
      price: priceScore,
      duration: durationScore,
      tags: tagsScore,
    },
    isDuplicate: compositeScore >= DEDUP.SIMILARITY_THRESHOLD,
  };
}
