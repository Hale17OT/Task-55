import { test, expect } from '@playwright/test';
import { login, authHeaders, ACCOUNTS } from '../fixtures/api-client';

const BASE = process.env.API_URL || 'http://localhost:3100';

test.describe('Dashboard & Analytics - Happy Paths', () => {
  test('ops user can load dashboard with all metric blocks', async ({ request }) => {
    const { token } = await login(request, ACCOUNTS.ops.username, ACCOUNTS.ops.password);
    const res = await request.get(`${BASE}/api/v1/analytics/dashboard?from=2026-01-01&to=2026-12-31`, {
      headers: await authHeaders(token),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.generatedAt).toBeTruthy();
    expect(body.popularity).toBeTruthy();
    expect(body.popularity.labels).toBeInstanceOf(Array);
    expect(body.conversionFunnel).toBeTruthy();
    expect(body.attendanceRate).toBeTruthy();
    expect(body.cancellationRate).toBeTruthy();
    expect(body.channelDistribution).toBeTruthy();
    expect(body.tagDistribution).toBeTruthy();
  });

  test('dashboard has populated popularity data from seed', async ({ request }) => {
    const { token } = await login(request, ACCOUNTS.ops.username, ACCOUNTS.ops.password);
    const res = await request.get(`${BASE}/api/v1/analytics/dashboard?from=2026-01-01&to=2026-12-31`, {
      headers: await authHeaders(token),
    });
    const body = await res.json();
    expect(body.popularity.labels.length).toBeGreaterThan(0);
    expect(body.popularity.labels).toContain('wedding');
  });

  test('export CSV returns valid CSV content', async ({ request }) => {
    // Admin bypasses quota/cooldown rules — deterministic
    const { token } = await login(request, ACCOUNTS.admin.username, ACCOUNTS.admin.password);
    const res = await request.post(`${BASE}/api/v1/analytics/export`, {
      headers: await authHeaders(token),
      data: { format: 'csv', filters: { from: '2026-01-01', to: '2026-12-31' } },
    });
    expect(res.status()).toBe(200);
    const text = await res.text();
    expect(text).toContain('Popularity');
    expect(res.headers()['content-type']).toContain('text/csv');
  });
});

test.describe('Dashboard & Analytics - Failure Paths', () => {
  test('403: merchant cannot access dashboard', async ({ request }) => {
    const { token } = await login(request, ACCOUNTS.merchant.username, ACCOUNTS.merchant.password);
    const res = await request.get(`${BASE}/api/v1/analytics/dashboard`, {
      headers: await authHeaders(token),
    });
    expect(res.status()).toBe(403);
  });

  test('422: invalid date range (from > to)', async ({ request }) => {
    const { token } = await login(request, ACCOUNTS.ops.username, ACCOUNTS.ops.password);
    const res = await request.get(`${BASE}/api/v1/analytics/dashboard?from=2026-12-31&to=2026-01-01`, {
      headers: await authHeaders(token),
    });
    expect(res.status()).toBe(422);
  });

  test('422: invalid export format', async ({ request }) => {
    // Admin bypasses cooldown — test the format validation deterministically
    const { token } = await login(request, ACCOUNTS.admin.username, ACCOUNTS.admin.password);
    const res = await request.post(`${BASE}/api/v1/analytics/export`, {
      headers: await authHeaders(token),
      data: { format: 'pdf' },
    });
    expect(res.status()).toBe(422);
  });
});
