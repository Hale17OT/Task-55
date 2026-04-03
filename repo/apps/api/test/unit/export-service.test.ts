import { describe, it, expect } from 'vitest';
import { generateCsv, generateExcel } from '../../src/infrastructure/export/export-service';
import type { DashboardPayload } from '../../src/core/domain/analytics';

const mockPayload: DashboardPayload = {
  generatedAt: new Date().toISOString(),
  filters: { from: '2026-01-01T00:00:00Z', to: '2026-01-31T00:00:00Z' },
  popularity: { labels: ['wedding', 'corporate'], data: [15, 8] },
  conversionFunnel: { stages: ['registered', 'confirmed', 'attended'], counts: [100, 75, 60] },
  attendanceRate: { labels: ['Attended', 'No-Show'], rates: [0.8, 0.2] },
  cancellationRate: { labels: ['Active', 'Cancelled'], rates: [0.9, 0.1] },
  channelDistribution: { labels: ['referral', 'website'], counts: [10, 13] },
  tagDistribution: { labels: ['outdoor', 'studio'], counts: [12, 11] },
};

describe('generateCsv', () => {
  it('generates valid CSV string', () => {
    const csv = generateCsv(mockPayload);
    expect(typeof csv).toBe('string');
    expect(csv.length).toBeGreaterThan(0);
  });

  it('includes all section headers', () => {
    const csv = generateCsv(mockPayload);
    expect(csv).toContain('Event/Job Popularity');
    expect(csv).toContain('Conversion Funnel');
    expect(csv).toContain('Attendance Rate');
    expect(csv).toContain('Cancellation Rate');
    expect(csv).toContain('Channel Distribution');
    expect(csv).toContain('Tag Distribution');
  });

  it('includes data values', () => {
    const csv = generateCsv(mockPayload);
    expect(csv).toContain('wedding');
    expect(csv).toContain('15');
    expect(csv).toContain('referral');
  });

  it('handles empty data', () => {
    const emptyPayload: DashboardPayload = {
      ...mockPayload,
      popularity: { labels: [], data: [] },
      conversionFunnel: { stages: [], counts: [] },
      attendanceRate: { labels: [], rates: [] },
      cancellationRate: { labels: [], rates: [] },
      channelDistribution: { labels: [], counts: [] },
      tagDistribution: { labels: [], counts: [] },
    };
    const csv = generateCsv(emptyPayload);
    expect(csv).toContain('Popularity');
    expect(csv.length).toBeGreaterThan(0);
  });
});

describe('generateExcel', () => {
  it('generates a Buffer', async () => {
    const buffer = await generateExcel(mockPayload);
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
  });

  it('starts with XLSX magic bytes (PK zip header)', async () => {
    const buffer = await generateExcel(mockPayload);
    expect(buffer[0]).toBe(0x50); // P
    expect(buffer[1]).toBe(0x4B); // K
  });
});
