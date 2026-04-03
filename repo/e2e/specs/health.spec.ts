import { test, expect } from '@playwright/test';

const BASE = process.env.API_URL || 'http://localhost:3100';

test.describe('Health & Infrastructure', () => {
  test('health endpoint returns 200 with db connected', async ({ request }) => {
    const res = await request.get(`${BASE}/api/v1/health`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.db).toBe('connected');
    expect(body.timestamp).toBeTruthy();
  });

  test('unknown route returns 404 with proper error shape', async ({ request }) => {
    const res = await request.get(`${BASE}/api/v1/nonexistent`);
    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('NOT_FOUND');
  });

  test('rate limit headers are present on responses', async ({ request }) => {
    const res = await request.get(`${BASE}/api/v1/health`);
    expect(res.headers()['x-ratelimit-limit']).toBeTruthy();
    expect(res.headers()['x-ratelimit-remaining']).toBeTruthy();
  });
});
