import { test, expect } from '@playwright/test';
import { login, authHeaders, ACCOUNTS } from '../fixtures/api-client';

const BASE = process.env.API_URL || 'http://localhost:3100';

test.describe('Admin Panel - Happy Paths', () => {
  test('list roles with permissions', async ({ request }) => {
    const { token } = await login(request, ACCOUNTS.admin.username, ACCOUNTS.admin.password);
    const res = await request.get(`${BASE}/api/v1/admin/roles`, { headers: await authHeaders(token) });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data).toBeInstanceOf(Array);
    expect(body.allPermissions.length).toBeGreaterThan(10);
  });

  test('list rules', async ({ request }) => {
    const { token } = await login(request, ACCOUNTS.admin.username, ACCOUNTS.admin.password);
    const res = await request.get(`${BASE}/api/v1/admin/rules`, { headers: await authHeaders(token) });
    expect(res.status()).toBe(200);
  });

  test('create rule, update, and delete', async ({ request }) => {
    const { token } = await login(request, ACCOUNTS.admin.username, ACCOUNTS.admin.password);
    const ruleKey = `e2e_rule_${Date.now()}`;
    const createRes = await request.post(`${BASE}/api/v1/admin/rules`, {
      headers: await authHeaders(token),
      data: { ruleKey, config: { limit: 50, window: 'day' }, effectiveFrom: '2026-06-01T00:00:00Z', canaryPercent: 25 },
    });
    expect(createRes.status()).toBe(201);
    const ruleId = (await createRes.json()).id;
    const updateRes = await request.put(`${BASE}/api/v1/admin/rules/${ruleId}`, {
      headers: await authHeaders(token), data: { canaryPercent: 100 },
    });
    expect(updateRes.status()).toBe(200);
    const deleteRes = await request.delete(`${BASE}/api/v1/admin/rules/${ruleId}`, { headers: await authHeaders(token) });
    expect(deleteRes.status()).toBe(204);
  });

  test('view audit log', async ({ request }) => {
    const { token } = await login(request, ACCOUNTS.admin.username, ACCOUNTS.admin.password);
    const res = await request.get(`${BASE}/api/v1/admin/audit`, { headers: await authHeaders(token) });
    expect(res.status()).toBe(200);
    expect((await res.json()).data.length).toBeGreaterThan(0);
  });

  test('store and reveal encrypted config', async ({ request }) => {
    const { token } = await login(request, ACCOUNTS.admin.username, ACCOUNTS.admin.password);
    const key = `E2E_CFG_${Date.now()}`;
    await request.put(`${BASE}/api/v1/admin/config/${key}`, {
      headers: await authHeaders(token), data: { value: 'reveal_me_123', isEncrypted: true },
    });
    const revealRes = await request.post(`${BASE}/api/v1/admin/config/${key}/reveal`, {
      headers: await authHeaders(token), data: { password: ACCOUNTS.admin.password },
    });
    expect(revealRes.status()).toBe(200);
    expect((await revealRes.json()).value).toBe('reveal_me_123');
  });

  test('list active sessions', async ({ request }) => {
    const { token } = await login(request, ACCOUNTS.admin.username, ACCOUNTS.admin.password);
    const res = await request.get(`${BASE}/api/v1/admin/sessions`, { headers: await authHeaders(token) });
    expect(res.status()).toBe(200);
    expect((await res.json()).data.length).toBeGreaterThan(0);
  });
});

test.describe('Admin Panel - Failure Paths', () => {
  test('403: merchant cannot access admin', async ({ request }) => {
    const { token } = await login(request, ACCOUNTS.merchant.username, ACCOUNTS.merchant.password);
    const res = await request.get(`${BASE}/api/v1/admin/roles`, { headers: await authHeaders(token) });
    expect(res.status()).toBe(403);
  });

  test('403: reveal with wrong password', async ({ request }) => {
    const { token } = await login(request, ACCOUNTS.admin.username, ACCOUNTS.admin.password);
    const key = `E2E_FAIL_${Date.now()}`;
    await request.put(`${BASE}/api/v1/admin/config/${key}`, {
      headers: await authHeaders(token), data: { value: 'test', isEncrypted: true },
    });
    const res = await request.post(`${BASE}/api/v1/admin/config/${key}/reveal`, {
      headers: await authHeaders(token), data: { password: 'WrongPassword123!@' },
    });
    expect(res.status()).toBe(403);
  });
});
