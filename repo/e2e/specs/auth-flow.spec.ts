import { test, expect } from '@playwright/test';
import { login, authHeaders, ACCOUNTS } from '../fixtures/api-client';

const BASE = process.env.API_URL || 'http://localhost:3100';

test.describe('Auth - Happy Paths', () => {
  test('register and login', async ({ request }) => {
    const username = `e2e_user_${Date.now()}`;
    const password = 'E2eTestPass123!@';
    const regRes = await request.post(`${BASE}/api/v1/auth/register`, { data: { username, password } });
    expect(regRes.status()).toBe(201);
    const { token } = await login(request, username, password);
    expect(token).toBeTruthy();
  });

  test('session returns user info', async ({ request }) => {
    const { token } = await login(request, ACCOUNTS.merchant.username, ACCOUNTS.merchant.password);
    const res = await request.get(`${BASE}/api/v1/auth/session`, { headers: await authHeaders(token) });
    expect(res.status()).toBe(200);
    expect((await res.json()).role).toBe('merchant');
  });

  test('refresh returns new access token via cookie', async ({ request }) => {
    // Login sets refreshToken as httpOnly cookie on the request context
    await login(request, ACCOUNTS.client.username, ACCOUNTS.client.password);
    // Refresh — Playwright sends cookies automatically
    const res = await request.post(`${BASE}/api/v1/auth/refresh`, { data: {} });
    expect(res.status()).toBe(200);
    expect((await res.json()).accessToken).toBeTruthy();
  });

  test('logout returns 204', async ({ request }) => {
    const { token } = await login(request, ACCOUNTS.client.username, ACCOUNTS.client.password);
    const res = await request.post(`${BASE}/api/v1/auth/logout`, { headers: await authHeaders(token) });
    expect(res.status()).toBe(204);
  });
});

test.describe('Auth - Failure Paths', () => {
  test('401: no token on protected route', async ({ request }) => {
    const res = await request.get(`${BASE}/api/v1/auth/session`);
    expect(res.status()).toBe(401);
  });

  test('401: wrong credentials', async ({ request }) => {
    const res = await request.post(`${BASE}/api/v1/auth/login`, { data: { username: 'merchant1', password: 'Wrong123!@Wrong' } });
    expect(res.status()).toBe(401);
  });

  test('409: duplicate registration', async ({ request }) => {
    const u = `e2e_dup_${Date.now()}`;
    await request.post(`${BASE}/api/v1/auth/register`, { data: { username: u, password: 'E2eTestPass123!@' } });
    const res = await request.post(`${BASE}/api/v1/auth/register`, { data: { username: u, password: 'E2eTestPass123!@' } });
    expect(res.status()).toBe(409);
  });

  test('400: weak password', async ({ request }) => {
    const res = await request.post(`${BASE}/api/v1/auth/register`, { data: { username: `e2e_w_${Date.now()}`, password: 'short' } });
    expect(res.status()).toBe(400);
  });
});
