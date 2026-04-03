import { test, expect } from '@playwright/test';
import { login, authHeaders, ACCOUNTS } from '../fixtures/api-client';

const BASE = process.env.API_URL || 'http://localhost:3100';

test.describe('Offerings - Happy Paths', () => {
  test('list offerings', async ({ request }) => {
    const { token } = await login(request, ACCOUNTS.merchant.username, ACCOUNTS.merchant.password);
    const res = await request.get(`${BASE}/api/v1/offerings`, { headers: await authHeaders(token) });
    expect(res.status()).toBe(200);
    expect((await res.json()).data).toBeInstanceOf(Array);
  });

  test('create offering', async ({ request }) => {
    const { token } = await login(request, ACCOUNTS.merchant.username, ACCOUNTS.merchant.password);
    const listRes = await request.get(`${BASE}/api/v1/offerings`, { headers: await authHeaders(token) });
    const offerings = await listRes.json();
    if (!offerings.data?.length) return;
    const orgId = offerings.data[0].orgId;

    const res = await request.post(`${BASE}/api/v1/offerings`, {
      headers: await authHeaders(token),
      data: { title: `E2E ${Date.now()}`, basePriceCents: 150000, durationMinutes: 120, visibility: 'public', orgId },
    });
    expect(res.status()).toBe(201);
    expect((await res.json()).status).toBe('draft');
    expect(Number.isInteger((await res.json()).basePriceCents)).toBe(true);
  });

  test('get offering with addons', async ({ request }) => {
    const { token } = await login(request, ACCOUNTS.merchant.username, ACCOUNTS.merchant.password);
    const listRes = await request.get(`${BASE}/api/v1/offerings`, { headers: await authHeaders(token) });
    const offerings = await listRes.json();
    if (!offerings.data?.length) return;
    const res = await request.get(`${BASE}/api/v1/offerings/${offerings.data[0].id}`, { headers: await authHeaders(token) });
    expect(res.status()).toBe(200);
    expect((await res.json()).addons).toBeInstanceOf(Array);
  });
});

test.describe('Offerings - Failure Paths', () => {
  test('403: client cannot create', async ({ request }) => {
    const { token } = await login(request, ACCOUNTS.client.username, ACCOUNTS.client.password);
    const res = await request.post(`${BASE}/api/v1/offerings`, {
      headers: await authHeaders(token),
      data: { title: 'X', basePriceCents: 1000, durationMinutes: 60, orgId: '00000000-0000-0000-0000-000000000001' },
    });
    expect(res.status()).toBe(403);
  });

  test('404: non-existent offering', async ({ request }) => {
    const { token } = await login(request, ACCOUNTS.merchant.username, ACCOUNTS.merchant.password);
    const res = await request.get(`${BASE}/api/v1/offerings/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee`, { headers: await authHeaders(token) });
    expect(res.status()).toBe(404);
  });

  test('400: float price rejected', async ({ request }) => {
    const { token } = await login(request, ACCOUNTS.merchant.username, ACCOUNTS.merchant.password);
    const res = await request.post(`${BASE}/api/v1/offerings`, {
      headers: await authHeaders(token),
      data: { title: 'Test', basePriceCents: 99.99, durationMinutes: 60, orgId: '00000000-0000-0000-0000-000000000001' },
    });
    expect(res.status()).toBe(400);
  });
});
