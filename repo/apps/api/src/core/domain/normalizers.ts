import { DPI_STANDARD, PAPER_SIZES } from '@studioops/shared';

// --- Currency normalization ---

/** Simplified exchange rates to USD (for offline use). Real system would use a configurable table. */
const EXCHANGE_RATES: Record<string, number> = {
  USD: 1,
  EUR: 1.08,
  GBP: 1.27,
  JPY: 0.0067,
  CAD: 0.74,
  AUD: 0.65,
  CHF: 1.13,
};

export interface CurrencyNormalizationResult {
  cents: number;
  originalCurrency: string;
  flagged: boolean;
  flagReason?: string;
}

export function normalizeCurrency(amount: number, currency: string): CurrencyNormalizationResult {
  const upper = currency.toUpperCase();
  const rate = EXCHANGE_RATES[upper];

  if (!rate) {
    return {
      cents: Math.round(amount * 100),
      originalCurrency: upper,
      flagged: true,
      flagReason: `Unknown currency: ${upper}`,
    };
  }

  const usdAmount = amount * rate;
  return {
    cents: Math.round(usdAmount * 100),
    originalCurrency: upper,
    flagged: false,
  };
}

// --- Duration normalization ---

export function normalizeDuration(value: number, unit: 'seconds' | 'minutes' | 'hours'): number {
  switch (unit) {
    case 'seconds': return value / 60;
    case 'minutes': return value;
    case 'hours': return value * 60;
  }
}

// --- Dimension normalization ---

export function cmToInches(cm: number): number {
  return cm / 2.54;
}

export function mmToInches(mm: number): number {
  return mm / 25.4;
}

export function pixelsToInches(pixels: number, dpi: number = DPI_STANDARD): number {
  return pixels / dpi;
}

export function paperSizeToInches(sizeName: string): { widthInches: number; heightInches: number } | null {
  return PAPER_SIZES[sizeName] ?? null;
}

// --- Outlier detection ---

export interface OutlierResult {
  isOutlier: boolean;
  value: number;
  median: number;
  ratio: number;
}

export function detectOutlier(value: number, median: number, threshold: number = 10): OutlierResult {
  if (median === 0) {
    return { isOutlier: false, value, median, ratio: 0 };
  }

  const ratio = value / median;
  const isOutlier = ratio > threshold || ratio < (1 / threshold);

  return { isOutlier, value, median, ratio };
}
