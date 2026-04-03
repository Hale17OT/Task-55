import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { createTestApp } from '../helpers/build-test-app';
import type { FastifyInstance } from 'fastify';

const VALID_PASSWORD = 'ValidPass123!@';

describe('Admin Routes', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let merchantToken: string;
  let orgId: string;

  beforeAll(async () => {
    app = await createTestApp();

    const orgs = await app.db.execute(sql`SELECT id FROM organizations LIMIT 1`);
    orgId = (orgs[0] as any).id;

    // Create admin user
    const adminName = `admin_${Date.now()}`;
    await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { username: adminName, password: VALID_PASSWORD } });
    await app.db.execute(sql`UPDATE users SET role = 'administrator' WHERE username = ${adminName}`);
    const adminLogin = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { username: adminName, password: VALID_PASSWORD } });
    adminToken = adminLogin.json().accessToken;

    // Create merchant for 403 test
    const mName = `m_admin_${Date.now()}`;
    await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { username: mName, password: VALID_PASSWORD } });
    const mLogin = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { username: mName, password: VALID_PASSWORD } });
    merchantToken = mLogin.json().accessToken;
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  describe('Access control', () => {
    it('returns 403 for non-admin on all admin endpoints', async () => {
      const endpoints = [
        { method: 'GET' as const, url: '/api/v1/admin/roles' },
        { method: 'GET' as const, url: '/api/v1/admin/rules' },
        { method: 'GET' as const, url: '/api/v1/admin/audit' },
        { method: 'GET' as const, url: '/api/v1/admin/config' },
        { method: 'GET' as const, url: '/api/v1/admin/sessions' },
      ];

      for (const ep of endpoints) {
        const res = await app.inject({ ...ep, headers: { authorization: `Bearer ${merchantToken}` } });
        expect(res.statusCode).toBe(403);
      }
    });
  });

  describe('Roles management', () => {
    it('GET /admin/roles returns roles with permissions', async () => {
      const res = await app.inject({
        method: 'GET', url: '/api/v1/admin/roles',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data).toBeInstanceOf(Array);
      expect(res.json().allPermissions).toBeInstanceOf(Array);
    });

    it('PUT /admin/roles/:roleId/permissions updates permissions', async () => {
      const res = await app.inject({
        method: 'PUT', url: '/api/v1/admin/roles/guest/permissions',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { permissions: ['offering:read', 'event:read'] },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().permissions).toContain('offering:read');
      expect(res.json().permissions).toContain('event:read');
    });

    it('PUT /admin/roles/:roleId/permissions rejects unknown permission', async () => {
      const res = await app.inject({
        method: 'PUT', url: '/api/v1/admin/roles/guest/permissions',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { permissions: ['offering:read', 'fake:permission'] },
      });
      expect(res.statusCode).toBe(422);
      expect(res.json().unknownPermissions).toContain('fake:permission');
    });
  });

  describe('Rules CRUD', () => {
    let ruleId: string;
    const testRuleKey = `test_limit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    it('POST /admin/rules creates rule', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/admin/rules',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          ruleKey: testRuleKey,
          config: { limit: 20, window: 'day' },
          effectiveFrom: '2026-04-01T00:00:00Z',
          canaryPercent: 10,
        },
      });
      expect(res.statusCode).toBe(201);
      ruleId = res.json().id;
      expect(res.json().ruleKey).toBe(testRuleKey);
      expect(res.json().canaryPercent).toBe(10);
      expect(res.json().version).toBe(1);
    });

    it('POST /admin/rules auto-increments version', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/admin/rules',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          ruleKey: testRuleKey,
          config: { limit: 25, window: 'day' },
          effectiveFrom: '2026-05-01T00:00:00Z',
          canaryPercent: 50,
        },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().version).toBe(2);
    });

    it('GET /admin/rules lists rules', async () => {
      const res = await app.inject({
        method: 'GET', url: '/api/v1/admin/rules',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.length).toBeGreaterThan(0);
    });

    it('PUT /admin/rules/:id updates rule', async () => {
      const res = await app.inject({
        method: 'PUT', url: `/api/v1/admin/rules/${ruleId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { canaryPercent: 100 },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().canaryPercent).toBe(100);
    });

    it('DELETE /admin/rules/:id soft-deletes (deprecated)', async () => {
      const res = await app.inject({
        method: 'DELETE', url: `/api/v1/admin/rules/${ruleId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(204);
    });

    it('POST /admin/rules rejects effectiveFrom > effectiveTo', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/admin/rules',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          ruleKey: 'invalid_dates',
          config: { limit: 10, window: 'hour' },
          effectiveFrom: '2026-12-01T00:00:00Z',
          effectiveTo: '2026-01-01T00:00:00Z',
        },
      });
      expect(res.statusCode).toBe(422);
    });
  });

  describe('Audit log viewer', () => {
    it('GET /admin/audit returns paginated audit entries', async () => {
      const res = await app.inject({
        method: 'GET', url: '/api/v1/admin/audit',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data).toBeInstanceOf(Array);
      expect(res.json().meta.page).toBe(1);
    });

    it('GET /admin/audit supports resourceType filter', async () => {
      const res = await app.inject({
        method: 'GET', url: '/api/v1/admin/audit?resourceType=auth',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
    });
  });

  describe('Config management', () => {
    it('PUT /admin/config/:key stores encrypted config', async () => {
      const res = await app.inject({
        method: 'PUT', url: '/api/v1/admin/config/TEST_SECRET',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { value: 'my_secret_api_key_12345', isEncrypted: true },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().isEncrypted).toBe(true);
    });

    it('GET /admin/config returns masked values', async () => {
      const res = await app.inject({
        method: 'GET', url: '/api/v1/admin/config',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const entry = res.json().data.find((e: any) => e.key === 'TEST_SECRET');
      expect(entry).toBeDefined();
      expect(entry.displayValue).toContain('****');
      expect(entry.displayValue).not.toContain('my_secret_api_key_12345');
    });

    it('POST /admin/config/:key/reveal decrypts with correct password', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/admin/config/TEST_SECRET/reveal',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { password: VALID_PASSWORD },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().value).toBe('my_secret_api_key_12345');
    });

    it('POST /admin/config/:key/reveal rejects wrong password', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/admin/config/TEST_SECRET/reveal',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { password: 'WrongPassword123!@' },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error).toBe('REAUTH_FAILED');
    });

    it('POST /admin/config/:key/reveal rejects non-encrypted key', async () => {
      // Store a non-encrypted value (use non-sensitive name to avoid ENCRYPTION_REQUIRED policy)
      await app.inject({
        method: 'PUT', url: '/api/v1/admin/config/STUDIO_NAME',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { value: 'plain_value', isEncrypted: false },
      });

      const res = await app.inject({
        method: 'POST', url: '/api/v1/admin/config/STUDIO_NAME/reveal',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { password: VALID_PASSWORD },
      });
      expect(res.statusCode).toBe(422);
      expect(res.json().error).toBe('NOT_ENCRYPTED');
    });
  });

  describe('Session management', () => {
    it('GET /admin/sessions returns active sessions', async () => {
      const res = await app.inject({
        method: 'GET', url: '/api/v1/admin/sessions',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data).toBeInstanceOf(Array);
      expect(res.json().data.length).toBeGreaterThan(0);
    });

    it('DELETE /admin/sessions/:sessionId revokes session', async () => {
      // Create a new user session to revoke
      const tempUser = `temp_sess_${Date.now()}`;
      await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { username: tempUser, password: VALID_PASSWORD } });
      await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { username: tempUser, password: VALID_PASSWORD } });

      // Find sessions for this user
      const tempUserRow = await app.db.execute(sql`SELECT id FROM users WHERE username = ${tempUser} LIMIT 1`);
      const tempUserId = (tempUserRow[0] as any).id;
      const sessionRows = await app.db.execute(sql`SELECT id FROM sessions WHERE user_id = ${tempUserId} AND revoked = false LIMIT 1`);

      if (sessionRows.length > 0) {
        const sessionId = (sessionRows[0] as any).id;
        const res = await app.inject({
          method: 'DELETE', url: `/api/v1/admin/sessions/${sessionId}`,
          headers: { authorization: `Bearer ${adminToken}` },
        });
        expect(res.statusCode).toBe(204);
      }
    });

    it('DELETE /admin/sessions/:sessionId returns 404 for non-existent session', async () => {
      const res = await app.inject({
        method: 'DELETE', url: '/api/v1/admin/sessions/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().error).toBe('SESSION_NOT_FOUND');
    });
  });
});
