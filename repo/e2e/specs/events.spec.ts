import { test, expect } from '@playwright/test';
import { login, authHeaders, ACCOUNTS } from '../fixtures/api-client';

const BASE = process.env.API_URL || 'http://localhost:3100';

test.describe('Events & Registrations', () => {
  test('merchant lists events', async ({ request }) => {
    const { token } = await login(request, ACCOUNTS.merchant.username, ACCOUNTS.merchant.password);
    const res = await request.get(`${BASE}/api/v1/events`, { headers: await authHeaders(token) });
    expect(res.status()).toBe(200);
    expect((await res.json()).data.length).toBeGreaterThan(0);
  });

  test('merchant creates event, client registers', async ({ request }) => {
    const { token: mToken } = await login(request, ACCOUNTS.merchant.username, ACCOUNTS.merchant.password);
    const eventsRes = await request.get(`${BASE}/api/v1/events`, { headers: await authHeaders(mToken) });
    const events = await eventsRes.json();
    if (!events.data?.length) return;
    const orgId = events.data[0].orgId;

    const createRes = await request.post(`${BASE}/api/v1/events`, {
      headers: await authHeaders(mToken),
      data: { title: `E2E Ev ${Date.now()}`, eventType: 'portrait', scheduledAt: '2026-09-01T10:00:00Z', durationMinutes: 60, channel: 'website', tags: ['e2e'], orgId },
    });
    expect(createRes.status()).toBe(201);
    const eventId = (await createRes.json()).id;

    const { token: cToken } = await login(request, ACCOUNTS.client.username, ACCOUNTS.client.password);
    const regRes = await request.post(`${BASE}/api/v1/events/${eventId}/registrations`, {
      headers: await authHeaders(cToken), data: {},
    });
    expect(regRes.status()).toBe(201);
    expect((await regRes.json()).status).toBe('registered');
  });

  test('403: client cannot create event', async ({ request }) => {
    const { token } = await login(request, ACCOUNTS.client.username, ACCOUNTS.client.password);
    const res = await request.post(`${BASE}/api/v1/events`, {
      headers: await authHeaders(token),
      data: { title: 'X', eventType: 'x', scheduledAt: '2026-09-01T10:00:00Z', durationMinutes: 60, orgId: '00000000-0000-0000-0000-000000000001' },
    });
    expect(res.status()).toBe(403);
  });
});
