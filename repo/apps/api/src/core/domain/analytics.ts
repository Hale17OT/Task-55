import { createHash } from 'node:crypto';

export interface DashboardFilters {
  from: Date;
  to: Date;
  orgId?: string;
  eventType?: string;
}

export interface DashboardPayload {
  generatedAt: string;
  filters: { from: string; to: string; orgId?: string; eventType?: string };
  popularity: { labels: string[]; data: number[] };
  conversionFunnel: { stages: string[]; counts: number[] };
  attendanceRate: { labels: string[]; rates: number[] };
  cancellationRate: { labels: string[]; rates: number[] };
  channelDistribution: { labels: string[]; counts: number[] };
  tagDistribution: { labels: string[]; counts: number[] };
}

export function computeFilterHash(filters: DashboardFilters, orgScope?: string[]): string {
  const str = JSON.stringify({
    from: filters.from.toISOString(),
    to: filters.to.toISOString(),
    orgId: filters.orgId || 'all',
    eventType: filters.eventType || 'all',
    orgScope: orgScope ? orgScope.sort().join(',') : 'all',
  });
  return createHash('sha256').update(str).digest('hex').slice(0, 16);
}

export function safeRatio(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Math.round((numerator / denominator) * 10000) / 10000; // 4 decimal places
}

export function isValidDate(d: Date): boolean {
  return d instanceof Date && !isNaN(d.getTime());
}

export function validateDateRange(from: Date, to: Date): { valid: boolean; error?: string } {
  if (!isValidDate(from)) {
    return { valid: false, error: 'Invalid "from" date format' };
  }
  if (!isValidDate(to)) {
    return { valid: false, error: 'Invalid "to" date format' };
  }
  if (from > to) {
    return { valid: false, error: 'Invalid date range: from must be before to' };
  }
  return { valid: true };
}
