import { normalizeCurrency, normalizeDuration, detectOutlier } from '../domain/normalizers';
import { computeSimilarity } from '../domain/similarity';
import { DEDUP } from '@studioops/shared';

export interface CleansingTarget {
  id: string;
  title: string;
  priceCents: number;
  durationMinutes: number;
  tags: string[];
  orgId: string;
  /** Optional: raw currency before normalization (for flagging unknown currencies) */
  rawCurrency?: string;
  /** Optional: raw duration value + unit before normalization */
  rawDuration?: { value: number; unit: 'seconds' | 'minutes' | 'hours' };
}

export interface CleansingResult {
  flags: Array<{ field: string; issue: string; detail?: unknown }>;
  duplicateCandidates: Array<{ existingId: string; score: number; featureScores: unknown }>;
}

/**
 * Run automatic cleansing on a new/updated record:
 * 1. Detect outliers (price vs category median)
 * 2. Flag missing required fields
 * 3. Compare against existing records for duplicates
 */
export function autoCleanseRecord(
  record: CleansingTarget,
  existingRecords: CleansingTarget[],
  categoryMedianPrice: number,
): CleansingResult {
  const flags: CleansingResult['flags'] = [];
  const duplicateCandidates: CleansingResult['duplicateCandidates'] = [];

  // Normalize currency if raw value provided
  if (record.rawCurrency && record.rawCurrency !== 'USD') {
    const normalized = normalizeCurrency(record.priceCents / 100, record.rawCurrency);
    if (normalized.flagged) {
      flags.push({ field: 'currency', issue: 'UNKNOWN_CURRENCY', detail: { currency: record.rawCurrency, reason: normalized.flagReason } });
    }
    record.priceCents = normalized.cents;
  }

  // Normalize duration if raw value provided
  if (record.rawDuration && record.rawDuration.unit !== 'minutes') {
    record.durationMinutes = normalizeDuration(record.rawDuration.value, record.rawDuration.unit);
  }

  // Outlier detection on price
  if (categoryMedianPrice > 0) {
    const outlier = detectOutlier(record.priceCents, categoryMedianPrice);
    if (outlier.isOutlier) {
      flags.push({ field: 'price', issue: 'OUTLIER', detail: { value: record.priceCents, median: categoryMedianPrice, ratio: outlier.ratio } });
    }
  }

  // Missing field checks
  if (!record.title || record.title.trim().length === 0) {
    flags.push({ field: 'title', issue: 'MISSING' });
  }
  if (record.priceCents < 0) {
    flags.push({ field: 'price', issue: 'INVALID', detail: { value: record.priceCents } });
  }
  if (record.durationMinutes <= 0) {
    flags.push({ field: 'duration', issue: 'INVALID', detail: { value: record.durationMinutes } });
  }

  // Dedup: compare against existing records in same org
  for (const existing of existingRecords) {
    if (existing.id === record.id) continue;
    if (existing.orgId !== record.orgId) continue;

    const similarity = computeSimilarity({
      titleA: record.title,
      titleB: existing.title,
      priceA: record.priceCents,
      priceB: existing.priceCents,
      durationA: record.durationMinutes,
      durationB: existing.durationMinutes,
      tagsA: record.tags,
      tagsB: existing.tags,
    });

    if (similarity.isDuplicate) {
      duplicateCandidates.push({
        existingId: existing.id,
        score: similarity.compositeScore,
        featureScores: similarity.featureScores,
      });
    }
  }

  return { flags, duplicateCandidates };
}
