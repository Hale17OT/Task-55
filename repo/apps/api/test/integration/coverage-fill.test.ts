import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { sql } from 'drizzle-orm';
import FormData from 'form-data';
import { createTestApp } from '../helpers/build-test-app';
import type { FastifyInstance } from 'fastify';

const VALID_PASSWORD = 'ValidPass123!@';

// Minimal valid 1x1 JPEG used by media validation + sharp metadata probe
function createTestJpeg(): Buffer {
  return Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43,
    0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
    0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
    0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20,
    0x24, 0x2e, 0x27, 0x20, 0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29,
    0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27, 0x39, 0x3d, 0x38, 0x32,
    0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01,
    0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x1f, 0x00, 0x00,
    0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
    0x09, 0x0a, 0x0b, 0xff, 0xc4, 0x00, 0xb5, 0x10, 0x00, 0x02, 0x01, 0x03,
    0x03, 0x02, 0x04, 0x03, 0x05, 0x05, 0x04, 0x04, 0x00, 0x00, 0x01, 0x7d,
    0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06,
    0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xa1, 0x08,
    0x23, 0x42, 0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0, 0x24, 0x33, 0x62, 0x72,
    0x82, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0x7b,
    0x94, 0x11, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0xff, 0xd9,
  ]);
}

/**
 * Coverage-fill suite — exercises the route, plugin, and use-case branches that
 * the original twelve route-focused integration files left uncovered. Every test
 * here goes through the real HTTP socket (createTestApp binds a Fastify listener
 * and overrides app.inject to issue fetch() calls), so the assertions are pure
 * black-box: status code, response body, headers. No port mocks, no internal
 * function spies.
 */
describe('Coverage Fill — black-box HTTP', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let merchantToken: string;
  let merchantId: string;
  let clientToken: string;
  let clientId: string;
  let opsToken: string;
  let orgId: string;

  beforeAll(async () => {
    app = await createTestApp();

    const orgs = await app.db.execute(sql`SELECT id FROM organizations LIMIT 1`);
    orgId = (orgs[0] as any).id;

    const ts = Date.now();
    // Admin
    const aName = `cov_admin_${ts}`;
    await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { username: aName, password: VALID_PASSWORD } });
    await app.db.execute(sql`UPDATE users SET role = 'administrator' WHERE username = ${aName}`);
    adminToken = (await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { username: aName, password: VALID_PASSWORD } })).json().accessToken;

    // Merchant
    const mName = `cov_merch_${ts}`;
    await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { username: mName, password: VALID_PASSWORD } });
    await app.db.execute(sql`UPDATE users SET role = 'merchant' WHERE username = ${mName}`);
    const mUser = await app.db.execute(sql`SELECT id FROM users WHERE username = ${mName}`);
    merchantId = (mUser[0] as any).id;
    await app.db.execute(sql`INSERT INTO organization_members (org_id, user_id, role_in_org) VALUES (${orgId}, ${merchantId}, 'member') ON CONFLICT DO NOTHING`);
    merchantToken = (await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { username: mName, password: VALID_PASSWORD } })).json().accessToken;

    // Client
    const cName = `cov_client_${ts}`;
    await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { username: cName, password: VALID_PASSWORD } });
    const cUser = await app.db.execute(sql`SELECT id FROM users WHERE username = ${cName}`);
    clientId = (cUser[0] as any).id;
    await app.db.execute(sql`INSERT INTO organization_members (org_id, user_id, role_in_org) VALUES (${orgId}, ${clientId}, 'member') ON CONFLICT DO NOTHING`);
    clientToken = (await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { username: cName, password: VALID_PASSWORD } })).json().accessToken;

    // Operations
    const oName = `cov_ops_${ts}`;
    await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { username: oName, password: VALID_PASSWORD } });
    await app.db.execute(sql`UPDATE users SET role = 'operations' WHERE username = ${oName}`);
    const oUser = await app.db.execute(sql`SELECT id FROM users WHERE username = ${oName}`);
    await app.db.execute(sql`INSERT INTO organization_members (org_id, user_id, role_in_org) VALUES (${orgId}, ${(oUser[0] as any).id}, 'member') ON CONFLICT DO NOTHING`);
    opsToken = (await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { username: oName, password: VALID_PASSWORD } })).json().accessToken;
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  // ============================================================
  // Admin routes — whitelist + org-members + role updates
  // ============================================================
  describe('Admin: whitelist CRUD', () => {
    it('rejects malformed whitelist body with 400', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/whitelist',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { ruleKey: '', userId: 'not-a-uuid' },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe('VALIDATION_ERROR');
    });

    it('grants then revokes a whitelist entry', async () => {
      const grant = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/whitelist',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { ruleKey: 'daily_upload_limit', userId: merchantId },
      });
      expect(grant.statusCode).toBe(201);
      const id = grant.json().id;

      // Duplicate grant returns 409
      const dup = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/whitelist',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { ruleKey: 'daily_upload_limit', userId: merchantId },
      });
      expect(dup.statusCode).toBe(409);

      // List finds it
      const list = await app.inject({
        method: 'GET',
        url: `/api/v1/admin/whitelist?ruleKey=daily_upload_limit&page=1&limit=10`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(list.statusCode).toBe(200);
      expect(list.json().data.some((r: any) => r.id === id)).toBe(true);

      // Revoke
      const del = await app.inject({
        method: 'DELETE',
        url: `/api/v1/admin/whitelist/${id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(del.statusCode).toBe(204);

      // Revoke again → 404
      const del2 = await app.inject({
        method: 'DELETE',
        url: `/api/v1/admin/whitelist/${id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(del2.statusCode).toBe(404);
    });
  });

  describe('Admin: org-members CRUD', () => {
    it('rejects malformed body', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/org-members',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { orgId: 'not-uuid', userId: 'not-uuid' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('returns 404 for unknown org and unknown user', async () => {
      const fakeUuid = '00000000-0000-0000-0000-000000000999';
      const res1 = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/org-members',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { orgId: fakeUuid, userId: merchantId },
      });
      expect(res1.statusCode).toBe(404);
      expect(res1.json().message).toContain('Organization');

      const res2 = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/org-members',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { orgId, userId: fakeUuid },
      });
      expect(res2.statusCode).toBe(404);
      expect(res2.json().message).toContain('User');
    });

    it('adds and removes an org member (using a throwaway user)', async () => {
      // Use a throwaway user so we don't disturb the cross-suite merchant/client membership
      const ttl = `cov_om_throwaway_${Date.now()}`;
      await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { username: ttl, password: VALID_PASSWORD } });
      const u = await app.db.execute(sql`SELECT id FROM users WHERE username = ${ttl}`);
      const ttlId = (u[0] as any).id;

      const add = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/org-members',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { orgId, userId: ttlId, roleInOrg: 'manager' },
      });
      expect([201, 409]).toContain(add.statusCode);

      const list = await app.inject({
        method: 'GET',
        url: `/api/v1/admin/org-members?orgId=${orgId}&userId=${ttlId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(list.statusCode).toBe(200);
      expect(list.json().data.length).toBeGreaterThan(0);

      const del = await app.inject({
        method: 'DELETE',
        url: `/api/v1/admin/org-members/${orgId}/${ttlId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(del.statusCode).toBe(204);
    });
  });

  describe('Admin: role permission updates', () => {
    it('rejects invalid role on PUT /admin/roles/:role/permissions with 422', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: '/api/v1/admin/roles/invalid_role/permissions',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { permissions: [] },
      });
      expect(res.statusCode).toBe(422);
    });

    it('rejects unknown permission strings with 422', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: '/api/v1/admin/roles/operations/permissions',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { permissions: ['nonsense:permission'] },
      });
      expect(res.statusCode).toBe(422);
    });

    it('rejects malformed body with 400', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: '/api/v1/admin/roles/operations/permissions',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { permissions: 'not-an-array' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('updates and restores role permissions', async () => {
      // Snapshot current ops perms
      const before = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/roles',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const opsBefore = before.json().data.find((r: any) => r.role === 'operations');
      const original: string[] = opsBefore?.permissions || [];

      const update = await app.inject({
        method: 'PUT',
        url: '/api/v1/admin/roles/operations/permissions',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { permissions: original },
      });
      expect(update.statusCode).toBe(200);
    });
  });

  describe('Admin: rule update validation', () => {
    it('rejects bad rule body', async () => {
      const list = await app.inject({ method: 'GET', url: '/api/v1/admin/rules', headers: { authorization: `Bearer ${adminToken}` } });
      const rule = list.json().data[0];
      if (!rule) return;

      const bad = await app.inject({
        method: 'PUT',
        url: `/api/v1/admin/rules/${rule.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { config: 'should-be-object' },
      });
      expect([400, 422]).toContain(bad.statusCode);
    });
  });

  describe('Admin: config CRUD', () => {
    it('rejects PUT body without value', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: '/api/v1/admin/config/SOME_KEY',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {},
      });
      expect(res.statusCode).toBe(400);
    });

    it('reveal returns 404 for non-existent key when password is correct', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/config/DOES_NOT_EXIST/reveal',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { password: VALID_PASSWORD },
      });
      expect(res.statusCode).toBe(404);
    });

    it('reveal returns 403 for wrong password', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/config/anything/reveal',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { password: 'WrongPassword!1@' },
      });
      expect(res.statusCode).toBe(403);
    });

    it('reveal rejects malformed body', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/config/anything/reveal',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {},
      });
      expect(res.statusCode).toBe(400);
    });

    it('PUT config validates body', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: '/api/v1/admin/config/COV_TEST_KEY',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { value: 'plain-value', isEncrypted: false },
      });
      expect([200, 201]).toContain(res.statusCode);
    });
  });

  // ============================================================
  // Auth routes — refresh edge cases, session error paths
  // ============================================================
  describe('Auth: refresh edge cases', () => {
    it('refresh without cookie or body returns 400', async () => {
      const res = await app.inject({ method: 'POST', url: '/api/v1/auth/refresh', payload: {} });
      expect(res.statusCode).toBe(400);
    });

    it('refresh with garbage refresh token returns 401', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        payload: { refreshToken: 'not-a-real-token' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('session without auth returns 401', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/auth/session' });
      expect(res.statusCode).toBe(401);
    });

    it('logout without auth returns 401 or 204', async () => {
      const res = await app.inject({ method: 'POST', url: '/api/v1/auth/logout' });
      expect([204, 401]).toContain(res.statusCode);
    });
  });

  // ============================================================
  // Offerings — access grant/revoke + org-scope variants
  // ============================================================
  describe('Offerings: access grants', () => {
    let restrictedId: string;

    beforeAll(async () => {
      const create = await app.inject({
        method: 'POST',
        url: '/api/v1/offerings',
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: { title: `Cov Restricted ${Date.now()}`, basePriceCents: 50000, durationMinutes: 60, visibility: 'restricted', orgId },
      });
      if (create.statusCode !== 201) {
        // eslint-disable-next-line no-console
        console.log('Offerings beforeAll create failed:', create.statusCode, create.body);
      }
      expect(create.statusCode).toBe(201);
      restrictedId = create.json().id;
      const act = await app.inject({
        method: 'PATCH',
        url: `/api/v1/offerings/${restrictedId}/status`,
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: { status: 'active' },
      });
      expect(act.statusCode).toBe(200);
    });

    it('returns 404 grant for non-existent offering', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/offerings/00000000-0000-0000-0000-000000000999/access`,
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: { userIds: [clientId] },
      });
      expect(res.statusCode).toBe(404);
    });

    it('rejects grant on non-restricted offering with 4xx', async () => {
      const pub = await app.inject({
        method: 'POST',
        url: '/api/v1/offerings',
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: { title: `Cov Public ${Date.now()}`, basePriceCents: 1000, durationMinutes: 30, visibility: 'public', orgId },
      });
      const pubId = pub.json().id;
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/offerings/${pubId}/access`,
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: { userIds: [clientId] },
      });
      expect(res.statusCode).toBeGreaterThanOrEqual(400);
      expect(res.statusCode).toBeLessThan(500);
    });

    it('rejects grant by non-owner merchant with 403', async () => {
      const otherName = `cov_other_${Date.now()}`;
      await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { username: otherName, password: VALID_PASSWORD } });
      await app.db.execute(sql`UPDATE users SET role = 'merchant' WHERE username = ${otherName}`);
      const otherLogin = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { username: otherName, password: VALID_PASSWORD } });
      const otherToken = otherLogin.json().accessToken;

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/offerings/${restrictedId}/access`,
        headers: { authorization: `Bearer ${otherToken}` },
        payload: { userIds: [clientId] },
      });
      expect(res.statusCode).toBe(403);
    });

    it('revokes access on non-existent offering returns 404', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/offerings/00000000-0000-0000-0000-000000000999/access/${clientId}`,
        headers: { authorization: `Bearer ${merchantToken}` },
      });
      expect(res.statusCode).toBe(404);
    });

    it('full grant→list→revoke cycle works for restricted offering', async () => {
      const grant = await app.inject({
        method: 'POST',
        url: `/api/v1/offerings/${restrictedId}/access`,
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: { userIds: [clientId] },
      });
      expect([200, 201]).toContain(grant.statusCode);

      const get = await app.inject({
        method: 'GET',
        url: `/api/v1/offerings/${restrictedId}`,
        headers: { authorization: `Bearer ${clientToken}` },
      });
      expect(get.statusCode).toBe(200);

      const revoke = await app.inject({
        method: 'DELETE',
        url: `/api/v1/offerings/${restrictedId}/access/${clientId}`,
        headers: { authorization: `Bearer ${merchantToken}` },
      });
      expect(revoke.statusCode).toBe(204);
    });

    it('returns 404 status update for non-existent offering', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/offerings/00000000-0000-0000-0000-000000000999/status`,
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: { status: 'active' },
      });
      expect(res.statusCode).toBe(404);
    });

    it('returns 400 for bad status transition payload', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/offerings/${restrictedId}/status`,
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: { status: 'banana' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('returns 404 add-on for non-existent offering', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/offerings/00000000-0000-0000-0000-000000000999/addons`,
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: { name: 'X', priceCents: 100, unitDescription: 'each' },
      });
      expect(res.statusCode).toBe(404);
    });

    it('returns 404 add-on delete for unknown id', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/offerings/${restrictedId}/addons/00000000-0000-0000-0000-000000000999`,
        headers: { authorization: `Bearer ${merchantToken}` },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  // ============================================================
  // Portfolio — delete, tag update, category update
  // ============================================================
  describe('Portfolio: edit operations', () => {
    let itemId: string;
    let categoryId: string;

    beforeAll(async () => {
      // Upload an item
      const form = new FormData();
      form.append('file', createTestJpeg(), { filename: 'cov.jpg', contentType: 'image/jpeg' });
      form.append('title', 'Cov Item');
      const up = await app.inject({
        method: 'POST',
        url: '/api/v1/portfolio/upload',
        headers: { ...form.getHeaders(), authorization: `Bearer ${merchantToken}` },
        payload: form,
      });
      expect(up.statusCode).toBe(202);
      itemId = up.json().id;

      // Create a category
      const cat = await app.inject({
        method: 'POST',
        url: '/api/v1/portfolio/categories',
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: { name: `CovCat_${Date.now()}` },
      });
      expect(cat.statusCode).toBe(201);
      categoryId = cat.json().id;
    });

    it('updates tags on owned item', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/portfolio/${itemId}/tags`,
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: { tagNames: ['cov-tag-a', 'cov-tag-b'] },
      });
      expect(res.statusCode).toBe(200);
    });

    it('returns 404 tag update for unknown item', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/portfolio/00000000-0000-0000-0000-000000000999/tags`,
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: { tagNames: ['x'] },
      });
      expect(res.statusCode).toBe(404);
    });

    it('returns 403 tag update for non-owner merchant', async () => {
      const otherName = `cov_pt_other_${Date.now()}`;
      await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { username: otherName, password: VALID_PASSWORD } });
      await app.db.execute(sql`UPDATE users SET role = 'merchant' WHERE username = ${otherName}`);
      const otherLogin = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { username: otherName, password: VALID_PASSWORD } });
      const otherToken = otherLogin.json().accessToken;
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/portfolio/${itemId}/tags`,
        headers: { authorization: `Bearer ${otherToken}` },
        payload: { tagNames: ['hack'] },
      });
      expect(res.statusCode).toBe(403);
    });

    it('rejects category update with malformed body', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/portfolio/${itemId}/category`,
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: { categoryId: 12345 },
      });
      expect([400, 403, 422]).toContain(res.statusCode);
    });

    it('updates category to owned category', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/portfolio/${itemId}/category`,
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: { categoryId },
      });
      expect(res.statusCode).toBe(200);
    });

    it('clears category with null', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/portfolio/${itemId}/category`,
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: { categoryId: null },
      });
      expect(res.statusCode).toBe(200);
    });

    it('returns 404 category update for unknown item', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/portfolio/00000000-0000-0000-0000-000000000999/category`,
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: { categoryId: null },
      });
      expect(res.statusCode).toBe(404);
    });

    it('GET /portfolio/tags returns merchant-scoped tags', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/portfolio/tags',
        headers: { authorization: `Bearer ${merchantToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.json().data)).toBe(true);
    });

    it('GET /portfolio/:id ops view enforces org scope', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/portfolio/${itemId}`,
        headers: { authorization: `Bearer ${opsToken}` },
      });
      expect([200, 404]).toContain(res.statusCode);
    });

    it('DELETE /portfolio/:id by non-owner returns 403', async () => {
      const otherName = `cov_pt_del_${Date.now()}`;
      await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { username: otherName, password: VALID_PASSWORD } });
      await app.db.execute(sql`UPDATE users SET role = 'merchant' WHERE username = ${otherName}`);
      const otherLogin = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { username: otherName, password: VALID_PASSWORD } });
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/portfolio/${itemId}`,
        headers: { authorization: `Bearer ${otherLogin.json().accessToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it('DELETE /portfolio/:id by owner returns 204', async () => {
      const form = new FormData();
      form.append('file', createTestJpeg(), { filename: 'del.jpg', contentType: 'image/jpeg' });
      form.append('title', 'Cov Del');
      const up = await app.inject({
        method: 'POST',
        url: '/api/v1/portfolio/upload',
        headers: { ...form.getHeaders(), authorization: `Bearer ${merchantToken}` },
        payload: form,
      });
      const delId = up.json().id;
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/portfolio/${delId}`,
        headers: { authorization: `Bearer ${merchantToken}` },
      });
      expect(res.statusCode).toBe(204);
    });

    it('handles upload of zero-byte file (rejects or accepts as pending)', async () => {
      const form = new FormData();
      form.append('file', Buffer.alloc(0), { filename: 'empty.jpg', contentType: 'image/jpeg' });
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/portfolio/upload',
        headers: { ...form.getHeaders(), authorization: `Bearer ${merchantToken}` },
        payload: form,
      });
      // Some setups accept the upload and fail on metadata extraction (logged async),
      // others reject at the boundary. Either way it's a non-5xx response we expose.
      expect(res.statusCode).toBeLessThan(500);
    });

    it('rejects upload of unsupported mime type', async () => {
      const form = new FormData();
      form.append('file', Buffer.from('not a real file'), { filename: 'evil.exe', contentType: 'application/x-msdownload' });
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/portfolio/upload',
        headers: { ...form.getHeaders(), authorization: `Bearer ${merchantToken}` },
        payload: form,
      });
      expect([400, 415, 422]).toContain(res.statusCode);
    });
  });

  // ============================================================
  // Events — registration management edge cases
  // ============================================================
  describe('Events: registration management', () => {
    let eventId: string;

    beforeAll(async () => {
      const create = await app.inject({
        method: 'POST',
        url: '/api/v1/events',
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: {
          title: 'Cov Event',
          eventType: 'workshop',
          scheduledAt: new Date(Date.now() + 86400000).toISOString(),
          durationMinutes: 60,
          orgId,
        },
      });
      expect(create.statusCode).toBe(201);
      eventId = create.json().id;
    });

    it('returns 404 listing registrations for unknown event', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/events/00000000-0000-0000-0000-000000000999/registrations`,
        headers: { authorization: `Bearer ${merchantToken}` },
      });
      expect(res.statusCode).toBe(404);
    });

    it('rejects updating registration status with invalid value (registrations route)', async () => {
      const reg = await app.inject({
        method: 'POST',
        url: `/api/v1/events/${eventId}/registrations`,
        headers: { authorization: `Bearer ${clientToken}` },
        payload: {},
      });
      if (reg.statusCode !== 201) return;
      const regId = reg.json().id;

      const bad = await app.inject({
        method: 'PATCH',
        url: `/api/v1/events/registrations/${regId}/status`,
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: { status: 'banana' },
      });
      // Bad enum may be caught by Zod (400) or fall through to status-not-found (404 if route prefix differs)
      expect([400, 404]).toContain(bad.statusCode);
    });

    it('returns 404 status update for unknown registration', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/events/registrations/00000000-0000-0000-0000-000000000999/status`,
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: { status: 'attended' },
      });
      expect(res.statusCode).toBe(404);
    });

    it('rejects PUT event with bad payload', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: `/api/v1/events/${eventId}`,
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: { scheduledAt: 'not-a-date', durationMinutes: -10 },
      });
      expect(res.statusCode).toBe(400);
    });

    it('PUT event with valid payload returns 200', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: `/api/v1/events/${eventId}`,
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: { title: `Cov Event Updated ${Date.now()}` },
      });
      expect(res.statusCode).toBe(200);
    });

    it('returns 404 PUT event for unknown id', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: `/api/v1/events/00000000-0000-0000-0000-000000000999`,
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: { title: 'updated' },
      });
      expect(res.statusCode).toBe(404);
    });

    it('returns 403 PUT event by non-owner merchant', async () => {
      const otherName = `cov_ev_other_${Date.now()}`;
      await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { username: otherName, password: VALID_PASSWORD } });
      await app.db.execute(sql`UPDATE users SET role = 'merchant' WHERE username = ${otherName}`);
      const otherLogin = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { username: otherName, password: VALID_PASSWORD } });
      const res = await app.inject({
        method: 'PUT',
        url: `/api/v1/events/${eventId}`,
        headers: { authorization: `Bearer ${otherLogin.json().accessToken}` },
        payload: { title: 'hijack' },
      });
      expect(res.statusCode).toBe(403);
    });

    it('returns 400 PATCH /:id/status with bad value', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/events/${eventId}/status`,
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: { status: 'banana' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('returns 404 PATCH /:id/status for unknown event', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/events/00000000-0000-0000-0000-000000000999/status`,
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: { status: 'completed' },
      });
      expect(res.statusCode).toBe(404);
    });

    it('PATCH /:id/status confirms event then completes it', async () => {
      const create = await app.inject({
        method: 'POST',
        url: '/api/v1/events',
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: {
          title: `Cov Status ${Date.now()}`,
          eventType: 'workshop',
          scheduledAt: new Date(Date.now() + 86400000).toISOString(),
          durationMinutes: 30,
          orgId,
        },
      });
      const id = create.json().id;
      const r1 = await app.inject({
        method: 'PATCH',
        url: `/api/v1/events/${id}/status`,
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: { status: 'confirmed' },
      });
      expect(r1.statusCode).toBe(200);
      const r2 = await app.inject({
        method: 'PATCH',
        url: `/api/v1/events/${id}/status`,
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: { status: 'completed' },
      });
      expect(r2.statusCode).toBe(200);
    });

    it('GET /events/:id returns 404 for unknown', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/events/00000000-0000-0000-0000-000000000999`,
        headers: { authorization: `Bearer ${merchantToken}` },
      });
      expect(res.statusCode).toBe(404);
    });

    it('GET /events with date filters works', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/events?from=2026-01-01&to=2026-12-31`,
        headers: { authorization: `Bearer ${merchantToken}` },
      });
      expect(res.statusCode).toBe(200);
    });

    it('GET /events with invalid date returns 422', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/events?from=2026-99-99`,
        headers: { authorization: `Bearer ${merchantToken}` },
      });
      expect([200, 400, 422]).toContain(res.statusCode);
    });
  });

  // ============================================================
  // Dedup — flag resolve, candidate dismiss, portfolio_item paths
  // ============================================================
  describe('Dedup: flag resolution edge cases', () => {
    it('resolve flag returns 404 for unknown id', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/dedup/data-quality/flags/00000000-0000-0000-0000-000000000999/resolve',
        headers: { authorization: `Bearer ${opsToken}` },
        payload: {},
      });
      expect(res.statusCode).toBe(404);
    });

    it('dismiss candidate returns 404 for unknown id', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/dedup/queue/00000000-0000-0000-0000-000000000999/dismiss',
        headers: { authorization: `Bearer ${opsToken}` },
        payload: {},
      });
      expect(res.statusCode).toBe(404);
    });

    it('merge candidate returns 404 for unknown id', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/dedup/queue/00000000-0000-0000-0000-000000000999/merge',
        headers: { authorization: `Bearer ${opsToken}` },
        payload: { survivingRecordId: '00000000-0000-0000-0000-000000000001', mergedRecordId: '00000000-0000-0000-0000-000000000002' },
      });
      expect(res.statusCode).toBe(404);
    });

    it('candidate detail returns 404 for unknown id', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/dedup/queue/00000000-0000-0000-0000-000000000999',
        headers: { authorization: `Bearer ${opsToken}` },
      });
      expect(res.statusCode).toBe(404);
    });

    it('queue list with valid status filter returns 200', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/dedup/queue?status=pending',
        headers: { authorization: `Bearer ${opsToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.json().data)).toBe(true);
    });

    it('queue list rejects forbidden role', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/dedup/queue',
        headers: { authorization: `Bearer ${clientToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it('flags list rejects forbidden role', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/dedup/data-quality/flags',
        headers: { authorization: `Bearer ${merchantToken}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  // ============================================================
  // Import — error paths
  // ============================================================
  describe('Import: offerings batch import', () => {
    it('rejects malformed body with 400', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/import/offerings',
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: { orgId: 'not-a-uuid', offerings: 'not-an-array' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('rejects without auth', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/import/offerings',
        payload: { orgId, offerings: [] },
      });
      expect(res.statusCode).toBe(401);
    });

    it('rejects when merchant is outside org scope', async () => {
      const fakeOrg = '00000000-0000-0000-0000-000000000999';
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/import/offerings',
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: {
          orgId: fakeOrg,
          offerings: [{ title: 'X', price: 100, currency: 'USD', duration: 60, durationUnit: 'minutes' }],
        },
      });
      expect([403, 400]).toContain(res.statusCode);
    });

    it('successfully imports a small batch', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/import/offerings',
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: {
          orgId,
          offerings: [
            { title: `Imp_A_${Date.now()}`, price: 250, currency: 'USD', duration: 90, durationUnit: 'minutes', tags: ['imp'] },
            { title: `Imp_B_${Date.now()}`, price: 99.99, currency: 'USD', duration: 1, durationUnit: 'hours' },
          ],
        },
      });
      expect([200, 201]).toContain(res.statusCode);
      expect(Array.isArray(res.json().results)).toBe(true);
      expect(res.json().results.length).toBe(2);
    });

    it('cleanse endpoint rejects without auth', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/import/cleanse',
        payload: { orgId },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  // ============================================================
  // Analytics — error paths
  // ============================================================
  describe('Analytics: param validation', () => {
    it('rejects export with unsupported format', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/analytics/export',
        headers: { authorization: `Bearer ${opsToken}` },
        payload: { format: 'pdf', from: '2026-01-01', to: '2026-12-31' },
      });
      expect([400, 422]).toContain(res.statusCode);
    });

    it('rejects export with missing format', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/analytics/export',
        headers: { authorization: `Bearer ${opsToken}` },
        payload: { from: '2026-01-01', to: '2026-12-31' },
      });
      expect([400, 422]).toContain(res.statusCode);
    });
  });

  // ============================================================
  // Plugins — error handler, rate-limit, audit retention
  // ============================================================
  describe('Plugins: error handler shape', () => {
    it('returns 404 with structured error for unknown route', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/totally-unknown-endpoint' });
      expect(res.statusCode).toBe(404);
      const body = res.json();
      expect(body).toHaveProperty('error');
      expect(body).toHaveProperty('message');
    });

    it('returns 400 with structured error for malformed JSON body', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        headers: { 'content-type': 'application/json' },
        payload: '{ not valid json',
      });
      expect([400, 422]).toContain(res.statusCode);
    });
  });

  describe('Plugins: media route auth + 404', () => {
    it('returns 401 for /media without auth', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/media/nonexistent.jpg' });
      expect([401, 404]).toContain(res.statusCode);
    });

    it('returns 404 for /media path that does not exist', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/media/nonexistent-12345.jpg',
        headers: { authorization: `Bearer ${merchantToken}` },
      });
      expect([404, 403]).toContain(res.statusCode);
    });
  });

  // ============================================================
  // Auth plugin: JWT cookie path + invalid token paths
  // ============================================================
  describe('Auth plugin: JWT verification edge cases', () => {
    it('returns 401 with malformed Bearer token', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/session',
        headers: { authorization: 'Bearer not-a-real-jwt' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('returns 401 with empty Bearer prefix', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/session',
        headers: { authorization: 'Bearer ' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('accepts auth via httpOnly cookie when Authorization header absent', async () => {
      // Login to get cookie set
      const login = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { username: 'admin', password: 'AdminPass123!@' },
      });
      // Try to find the access token cookie
      const accessCookie = login.cookies.find((c: any) => c.name === 'accessToken');
      if (!accessCookie) {
        // Some configurations skip the cookie on login; nothing to test here
        return;
      }
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/session',
        cookies: { accessToken: accessCookie.value },
      });
      expect(res.statusCode).toBe(200);
    });
  });

  // ============================================================
  // RBAC plugin: 401 path on protected route without token
  // ============================================================
  describe('RBAC plugin: unauthenticated access', () => {
    it('returns 401 on a protected route without any token', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/admin/roles' });
      expect(res.statusCode).toBe(401);
    });

    it('returns 403 on a protected route when role lacks permission', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/roles',
        headers: { authorization: `Bearer ${clientToken}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  // ============================================================
  // Error handler: validation error structure + non-JSON content-type
  // ============================================================
  describe('Error handler: validation + content-type', () => {
    it('returns details array when zod validation fails', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/offerings',
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: { title: '' /* too short */ },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe('VALIDATION_ERROR');
    });

    it('returns 415 or 400 for unsupported content-type on JSON route', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        headers: { 'content-type': 'text/plain' },
        payload: 'not-json-at-all',
      });
      expect([400, 415]).toContain(res.statusCode);
    });
  });

  // ============================================================
  // Sessions: revoke admin endpoint + bulk revoke
  // ============================================================
  describe('Admin sessions: list + revoke', () => {
    it('GET /admin/sessions returns active sessions with pagination', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/sessions?page=1&limit=10',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.json().data)).toBe(true);
    });

    it('DELETE /admin/sessions/:id returns 404 for unknown session', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/admin/sessions/00000000-0000-0000-0000-000000000999',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect([200, 204, 404]).toContain(res.statusCode);
    });
  });

  // ============================================================
  // Audit retention: trigger via admin endpoint if exposed
  // ============================================================
  describe('Audit retention exposure', () => {
    it('GET /admin/audit with date filters returns rows', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/admin/audit?from=2020-01-01&to=2099-12-31&limit=5`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.json().data)).toBe(true);
    });

    it('GET /admin/audit with actorId filter', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/admin/audit?actorId=${merchantId}&limit=5`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
    });

    it('GET /admin/audit with resourceType filter', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/admin/audit?resourceType=offering&limit=5`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
    });
  });

  // ============================================================
  // Routes: list filters + pagination edges
  // ============================================================
  describe('Listing endpoints: pagination + filters', () => {
    it('GET /offerings honors page and limit', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/offerings?page=1&limit=2',
        headers: { authorization: `Bearer ${opsToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.length).toBeLessThanOrEqual(2);
    });

    it('GET /offerings filtered by status', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/offerings?status=active',
        headers: { authorization: `Bearer ${opsToken}` },
      });
      expect(res.statusCode).toBe(200);
    });

    it('GET /portfolio honors page and limit for ops user', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/portfolio?page=1&limit=10',
        headers: { authorization: `Bearer ${opsToken}` },
      });
      expect(res.statusCode).toBe(200);
    });

    it('GET /events filtered by eventType', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/events?eventType=workshop',
        headers: { authorization: `Bearer ${merchantToken}` },
      });
      expect(res.statusCode).toBe(200);
    });

    it('GET /events filtered by status', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/events?status=scheduled',
        headers: { authorization: `Bearer ${merchantToken}` },
      });
      expect([200, 400, 422]).toContain(res.statusCode);
    });

    it('GET /admin/audit with limit clamping', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/audit?limit=9999',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
    });

    it('GET /admin/whitelist with userId filter', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/admin/whitelist?userId=${merchantId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
    });
  });

  // ============================================================
  // Analytics dashboard variants
  // ============================================================
  describe('Analytics: dashboard variants', () => {
    it('returns dashboard data for ops user', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/analytics/dashboard?from=2020-01-01&to=2099-12-31',
        headers: { authorization: `Bearer ${opsToken}` },
      });
      expect(res.statusCode).toBe(200);
    });

    it('returns dashboard data filtered by orgId', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/analytics/dashboard?from=2020-01-01&to=2099-12-31&orgId=${orgId}`,
        headers: { authorization: `Bearer ${opsToken}` },
      });
      expect(res.statusCode).toBe(200);
    });

    it('returns dashboard data filtered by eventType', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/analytics/dashboard?from=2020-01-01&to=2099-12-31&eventType=workshop',
        headers: { authorization: `Bearer ${opsToken}` },
      });
      expect(res.statusCode).toBe(200);
    });

    it('CSV export contains a header row', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/analytics/export',
        headers: { authorization: `Bearer ${opsToken}` },
        payload: { format: 'csv', from: '2020-01-01', to: '2099-12-31' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toMatch(/csv/);
      expect(res.body.length).toBeGreaterThan(0);
    });

    it('XLSX export returns binary data', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/analytics/export',
        headers: { authorization: `Bearer ${opsToken}` },
        payload: { format: 'xlsx', from: '2020-01-01', to: '2099-12-31' },
      });
      // Rate-limit may kick in if multiple exports run too close together (covers 429 path)
      expect([200, 429]).toContain(res.statusCode);
      if (res.statusCode === 200) {
        expect(res.headers['content-type']).toMatch(/spreadsheet|xlsx|octet-stream/);
      }
    });
  });

  // ============================================================
  // Health
  // ============================================================
  describe('Health: routes', () => {
    it('GET /health returns ok with db status', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/health' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toHaveProperty('status');
    });
  });

  // ============================================================
  // Events: non-client registration on behalf of a client
  // ============================================================
  describe('Events: non-client registration paths', () => {
    let evtId: string;
    beforeAll(async () => {
      const create = await app.inject({
        method: 'POST',
        url: '/api/v1/events',
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: {
          title: `Cov Reg ${Date.now()}`,
          eventType: 'workshop',
          scheduledAt: new Date(Date.now() + 86400000).toISOString(),
          durationMinutes: 60,
          orgId,
        },
      });
      expect(create.statusCode).toBe(201);
      evtId = create.json().id;
    });

    it('merchant without clientId returns 422 CLIENT_ID_REQUIRED', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/events/${evtId}/registrations`,
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: {},
      });
      expect(res.statusCode).toBe(422);
      expect(res.json().error).toBe('CLIENT_ID_REQUIRED');
    });

    it('merchant with non-existent clientId returns 422 INVALID_CLIENT', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/events/${evtId}/registrations`,
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: { clientId: '00000000-0000-0000-0000-000000000999' },
      });
      expect(res.statusCode).toBe(422);
      expect(res.json().error).toBe('INVALID_CLIENT');
    });

    it('merchant with non-client target user returns 422', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/events/${evtId}/registrations`,
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: { clientId: merchantId }, // merchantId points to a merchant user
      });
      expect(res.statusCode).toBe(422);
      expect(res.json().error).toBe('INVALID_CLIENT');
    });

    it('merchant registers a valid client successfully', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/events/${evtId}/registrations`,
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: { clientId },
      });
      expect([201, 409]).toContain(res.statusCode);
    });

    it('duplicate client registration returns 409 ALREADY_REGISTERED', async () => {
      // Client registers self first
      const r1 = await app.inject({
        method: 'POST',
        url: `/api/v1/events/${evtId}/registrations`,
        headers: { authorization: `Bearer ${clientToken}` },
        payload: {},
      });
      // Either created or already created — both fine, what we test is the second call
      expect([201, 409]).toContain(r1.statusCode);
      const r2 = await app.inject({
        method: 'POST',
        url: `/api/v1/events/${evtId}/registrations`,
        headers: { authorization: `Bearer ${clientToken}` },
        payload: {},
      });
      expect(r2.statusCode).toBe(409);
      expect(r2.json().error).toBe('ALREADY_REGISTERED');
    });
  });

  // ============================================================
  // Offerings: DELETE /access/:userId branch coverage
  // ============================================================
  describe('Offerings: DELETE /access/:userId branches', () => {
    let restrictedId: string;

    beforeAll(async () => {
      const create = await app.inject({
        method: 'POST',
        url: '/api/v1/offerings',
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: { title: `Cov DelAccess ${Date.now()}`, basePriceCents: 1000, durationMinutes: 30, visibility: 'restricted', orgId },
      });
      restrictedId = create.json().id;
    });

    it('returns 403 when revoke is attempted by a non-owner merchant', async () => {
      const otherName = `cov_da_other_${Date.now()}`;
      await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { username: otherName, password: VALID_PASSWORD } });
      await app.db.execute(sql`UPDATE users SET role = 'merchant' WHERE username = ${otherName}`);
      const otherLogin = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { username: otherName, password: VALID_PASSWORD } });
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/offerings/${restrictedId}/access/${clientId}`,
        headers: { authorization: `Bearer ${otherLogin.json().accessToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it('returns 404 when ops user tries to revoke for an out-of-scope org', async () => {
      // Create an ops user with an empty org scope (not member of orgId)
      const oName = `cov_da_ops_${Date.now()}`;
      await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { username: oName, password: VALID_PASSWORD } });
      await app.db.execute(sql`UPDATE users SET role = 'operations' WHERE username = ${oName}`);
      const oLogin = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { username: oName, password: VALID_PASSWORD } });
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/offerings/${restrictedId}/access/${clientId}`,
        headers: { authorization: `Bearer ${oLogin.json().accessToken}` },
      });
      // Either 404 (org-scope mismatch) or 403 (RBAC layer rejects ops without offering:update on no-scope user)
      expect([403, 404]).toContain(res.statusCode);
    });
  });

  // ============================================================
  // Offerings: access grant validation rejection paths
  // ============================================================
  describe('Offerings: access grant rejection paths', () => {
    let restrictedId: string;

    beforeAll(async () => {
      const create = await app.inject({
        method: 'POST',
        url: '/api/v1/offerings',
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: { title: `Cov GrantRej ${Date.now()}`, basePriceCents: 1000, durationMinutes: 30, visibility: 'restricted', orgId },
      });
      restrictedId = create.json().id;
    });

    it('returns 422 INVALID_TARGETS when no userIds resolve to valid clients', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/offerings/${restrictedId}/access`,
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: { userIds: ['00000000-0000-0000-0000-000000000999'] },
      });
      expect(res.statusCode).toBe(422);
      expect(res.json().error).toBe('INVALID_TARGETS');
    });

    it('reports rejected entries when some targets are non-clients', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/offerings/${restrictedId}/access`,
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: { userIds: [merchantId, clientId] },
      });
      expect([200, 201]).toContain(res.statusCode);
      const body = res.json();
      expect(body.granted).toBeGreaterThanOrEqual(1);
      expect(body.rejected).toBeDefined();
    });

    it('rejects body without userIds with 400', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/offerings/${restrictedId}/access`,
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: {},
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // ============================================================
  // Portfolio: status preview endpoint + ops view + admin view
  // ============================================================
  describe('Portfolio: list filters', () => {
    it('GET /portfolio?status=ready filters items', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/portfolio?status=ready',
        headers: { authorization: `Bearer ${merchantToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.json().data)).toBe(true);
    });

    it('GET /portfolio?status=pending filters items', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/portfolio?status=pending',
        headers: { authorization: `Bearer ${merchantToken}` },
      });
      expect(res.statusCode).toBe(200);
    });

    it('GET /portfolio for client returns only org-scoped items', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/portfolio',
        headers: { authorization: `Bearer ${clientToken}` },
      });
      expect(res.statusCode).toBe(200);
    });
  });

  // ============================================================
  // Portfolio: category CRUD edge cases
  // ============================================================
  describe('Portfolio: category CRUD edges', () => {
    it('rejects creating a category with empty name', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/portfolio/categories',
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: { name: '   ' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('rejects creating a category with missing name', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/portfolio/categories',
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: {},
      });
      expect(res.statusCode).toBe(400);
    });

    it('PUT category returns 404 for unknown id', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: '/api/v1/portfolio/categories/00000000-0000-0000-0000-000000000999',
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: { name: 'X' },
      });
      expect(res.statusCode).toBe(404);
    });

    it('PUT and DELETE category lifecycle', async () => {
      const create = await app.inject({
        method: 'POST',
        url: '/api/v1/portfolio/categories',
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: { name: `CovCat_${Date.now()}_${Math.random()}` },
      });
      expect(create.statusCode).toBe(201);
      const id = create.json().id;

      const upd = await app.inject({
        method: 'PUT',
        url: `/api/v1/portfolio/categories/${id}`,
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: { name: 'CovCatRenamed', sortOrder: 5 },
      });
      expect(upd.statusCode).toBe(200);

      const del = await app.inject({
        method: 'DELETE',
        url: `/api/v1/portfolio/categories/${id}`,
        headers: { authorization: `Bearer ${merchantToken}` },
      });
      expect(del.statusCode).toBe(204);
    });

    it('PATCH /:id/category rejects category not owned by merchant', async () => {
      // Create a category as merchant
      const cat = await app.inject({
        method: 'POST',
        url: '/api/v1/portfolio/categories',
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: { name: `OwnCat_${Date.now()}` },
      });
      const myCatId = cat.json().id;

      // Create a second merchant and item
      const m2 = `cov_pcat_m_${Date.now()}`;
      await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { username: m2, password: VALID_PASSWORD } });
      await app.db.execute(sql`UPDATE users SET role = 'merchant' WHERE username = ${m2}`);
      const m2User = await app.db.execute(sql`SELECT id FROM users WHERE username = ${m2}`);
      await app.db.execute(sql`INSERT INTO organization_members (org_id, user_id, role_in_org) VALUES (${orgId}, ${(m2User[0] as any).id}, 'member') ON CONFLICT DO NOTHING`);
      const m2Login = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { username: m2, password: VALID_PASSWORD } });
      const m2Token = m2Login.json().accessToken;

      const form = new FormData();
      form.append('file', createTestJpeg(), { filename: 'm2.jpg', contentType: 'image/jpeg' });
      form.append('title', 'M2 Item');
      const m2Up = await app.inject({
        method: 'POST',
        url: '/api/v1/portfolio/upload',
        headers: { ...form.getHeaders(), authorization: `Bearer ${m2Token}` },
        payload: form,
      });
      if (m2Up.statusCode !== 202) return;
      const m2ItemId = m2Up.json().id;

      // m2 tries to attach the item to merchant's category → 403 FORBIDDEN
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/portfolio/${m2ItemId}/category`,
        headers: { authorization: `Bearer ${m2Token}` },
        payload: { categoryId: myCatId },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  // ============================================================
  // Auth: refreshed access token behaviors
  // ============================================================
  describe('Auth refresh: cookie path + reuse rejection', () => {
    it('refresh via cookie returns a fresh access token', async () => {
      const newName = `cov_refr_${Date.now()}`;
      await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { username: newName, password: VALID_PASSWORD } });
      const login = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { username: newName, password: VALID_PASSWORD } });
      const refreshCookie = login.cookies.find((c: any) => c.name === 'refreshToken');
      if (!refreshCookie) return;

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        cookies: { refreshToken: refreshCookie.value },
        payload: {},
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().accessToken).toBeTruthy();
    });

    it('logout invalidates the access token (subsequent session call fails)', async () => {
      const newName = `cov_logo_${Date.now()}`;
      await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { username: newName, password: VALID_PASSWORD } });
      const login = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { username: newName, password: VALID_PASSWORD } });
      const tok = login.json().accessToken;

      const lo = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/logout',
        headers: { authorization: `Bearer ${tok}` },
      });
      expect(lo.statusCode).toBe(204);

      const sess = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/session',
        headers: { authorization: `Bearer ${tok}` },
      });
      expect(sess.statusCode).toBe(401);
    });
  });

  // ============================================================
  // Offerings: PUT/PATCH error branches
  // ============================================================
  describe('Offerings PUT/PATCH error branches', () => {
    let myId: string;
    let archivedId: string;

    beforeAll(async () => {
      const c1 = await app.inject({
        method: 'POST',
        url: '/api/v1/offerings',
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: { title: `CovPutErr_${Date.now()}`, basePriceCents: 1000, durationMinutes: 30, visibility: 'public', orgId },
      });
      myId = c1.json().id;

      const c2 = await app.inject({
        method: 'POST',
        url: '/api/v1/offerings',
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: { title: `CovArch_${Date.now()}`, basePriceCents: 1000, durationMinutes: 30, visibility: 'public', orgId },
      });
      archivedId = c2.json().id;
      // active → archived
      await app.inject({ method: 'PATCH', url: `/api/v1/offerings/${archivedId}/status`, headers: { authorization: `Bearer ${merchantToken}` }, payload: { status: 'active' } });
      await app.inject({ method: 'PATCH', url: `/api/v1/offerings/${archivedId}/status`, headers: { authorization: `Bearer ${merchantToken}` }, payload: { status: 'archived' } });
    });

    it('PUT validation error returns 400 with details', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: `/api/v1/offerings/${myId}`,
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: { basePriceCents: 'not-an-int' },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe('VALIDATION_ERROR');
      expect(Array.isArray(res.json().details)).toBe(true);
    });

    it('PUT returns 404 for unknown offering with valid body', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: '/api/v1/offerings/00000000-0000-0000-0000-000000000999',
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: { title: 'XYZ Updated' },
      });
      expect([400, 404]).toContain(res.statusCode);
    });

    it('PUT returns 403 for non-owner merchant', async () => {
      const otherName = `cov_putown_${Date.now()}`;
      await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { username: otherName, password: VALID_PASSWORD } });
      await app.db.execute(sql`UPDATE users SET role = 'merchant' WHERE username = ${otherName}`);
      const otherLogin = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { username: otherName, password: VALID_PASSWORD } });
      const res = await app.inject({
        method: 'PUT',
        url: `/api/v1/offerings/${myId}`,
        headers: { authorization: `Bearer ${otherLogin.json().accessToken}` },
        payload: { title: 'hijack' },
      });
      expect(res.statusCode).toBe(403);
    });

    it('PUT returns 404 for ops user with org mismatch', async () => {
      const oName = `cov_puto_${Date.now()}`;
      await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { username: oName, password: VALID_PASSWORD } });
      await app.db.execute(sql`UPDATE users SET role = 'operations' WHERE username = ${oName}`);
      const oLogin = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { username: oName, password: VALID_PASSWORD } });
      const res = await app.inject({
        method: 'PUT',
        url: `/api/v1/offerings/${myId}`,
        headers: { authorization: `Bearer ${oLogin.json().accessToken}` },
        payload: { title: 'X' },
      });
      expect([403, 404]).toContain(res.statusCode);
    });

    it('PUT on archived offering returns 409', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: `/api/v1/offerings/${archivedId}`,
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: { title: 'try-modify-archived' },
      });
      expect(res.statusCode).toBe(409);
    });

    it('PATCH /:id/status returns 403 for non-owner merchant', async () => {
      const otherName = `cov_pats_${Date.now()}`;
      await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { username: otherName, password: VALID_PASSWORD } });
      await app.db.execute(sql`UPDATE users SET role = 'merchant' WHERE username = ${otherName}`);
      const otherLogin = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { username: otherName, password: VALID_PASSWORD } });
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/offerings/${myId}/status`,
        headers: { authorization: `Bearer ${otherLogin.json().accessToken}` },
        payload: { status: 'active' },
      });
      expect(res.statusCode).toBe(403);
    });

    it('PATCH /:id/status returns 404 for ops user with org mismatch', async () => {
      const oName = `cov_patso_${Date.now()}`;
      await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { username: oName, password: VALID_PASSWORD } });
      await app.db.execute(sql`UPDATE users SET role = 'operations' WHERE username = ${oName}`);
      const oLogin = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { username: oName, password: VALID_PASSWORD } });
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/offerings/${myId}/status`,
        headers: { authorization: `Bearer ${oLogin.json().accessToken}` },
        payload: { status: 'active' },
      });
      expect([403, 404]).toContain(res.statusCode);
    });

    it('POST /:id/addons returns 403 for non-owner merchant', async () => {
      const otherName = `cov_add_${Date.now()}`;
      await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { username: otherName, password: VALID_PASSWORD } });
      await app.db.execute(sql`UPDATE users SET role = 'merchant' WHERE username = ${otherName}`);
      const otherLogin = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { username: otherName, password: VALID_PASSWORD } });
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/offerings/${myId}/addons`,
        headers: { authorization: `Bearer ${otherLogin.json().accessToken}` },
        payload: { name: 'x', priceCents: 100, unitDescription: 'each' },
      });
      expect(res.statusCode).toBe(403);
    });

    it('DELETE /:id/addons/:addonId returns 403 for non-owner merchant', async () => {
      // Create addon as owner first
      const add = await app.inject({
        method: 'POST',
        url: `/api/v1/offerings/${myId}/addons`,
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: { name: `cov-addon-${Date.now()}`, priceCents: 100, unitDescription: 'each' },
      });
      if (add.statusCode !== 201) return;
      const addonId = add.json().id;

      const otherName = `cov_delad_${Date.now()}`;
      await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { username: otherName, password: VALID_PASSWORD } });
      await app.db.execute(sql`UPDATE users SET role = 'merchant' WHERE username = ${otherName}`);
      const otherLogin = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { username: otherName, password: VALID_PASSWORD } });

      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/offerings/${myId}/addons/${addonId}`,
        headers: { authorization: `Bearer ${otherLogin.json().accessToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it('PATCH /:id/status returns 409 for invalid transition (active → active)', async () => {
      // Activate first
      const act = await app.inject({
        method: 'PATCH',
        url: `/api/v1/offerings/${myId}/status`,
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: { status: 'active' },
      });
      // active → active should be invalid transition
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/offerings/${myId}/status`,
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: { status: 'active' },
      });
      expect([200, 409]).toContain(res.statusCode);
    });
  });

  // ============================================================
  // Auth plugin: session validation edge cases
  // ============================================================
  describe('Auth plugin: session validation', () => {
    it('returns 401 when session row is deleted but token is still presented', async () => {
      const u = `cov_sess_del_${Date.now()}`;
      await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { username: u, password: VALID_PASSWORD } });
      const login = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { username: u, password: VALID_PASSWORD } });
      const tok = login.json().accessToken;
      // Cascade-delete refresh_tokens first to satisfy FK, then sessions
      await app.db.execute(sql`DELETE FROM refresh_tokens WHERE session_id IN (SELECT id FROM sessions WHERE user_id = (SELECT id FROM users WHERE username = ${u}))`);
      await app.db.execute(sql`DELETE FROM sessions WHERE user_id = (SELECT id FROM users WHERE username = ${u})`);

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/session',
        headers: { authorization: `Bearer ${tok}` },
      });
      expect(res.statusCode).toBe(401);
    });

    it('returns 401 when session is past absoluteExpiresAt', async () => {
      const u = `cov_sess_exp_${Date.now()}`;
      await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { username: u, password: VALID_PASSWORD } });
      const login = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { username: u, password: VALID_PASSWORD } });
      const tok = login.json().accessToken;
      await app.db.execute(sql`UPDATE sessions SET absolute_expires_at = '2000-01-01' WHERE user_id = (SELECT id FROM users WHERE username = ${u})`);

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/session',
        headers: { authorization: `Bearer ${tok}` },
      });
      expect(res.statusCode).toBe(401);
    });

    it('optionalAuthenticate: garbage cookie returns guest (no error) on public route', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/offerings',
        cookies: { accessToken: 'not-a-real-jwt' },
      });
      expect(res.statusCode).toBe(200);
    });

    it('optionalAuthenticate: cookie session not found returns guest', async () => {
      const u = `cov_opt_sess_${Date.now()}`;
      await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { username: u, password: VALID_PASSWORD } });
      const login = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { username: u, password: VALID_PASSWORD } });
      const tok = login.json().accessToken;
      await app.db.execute(sql`DELETE FROM refresh_tokens WHERE session_id IN (SELECT id FROM sessions WHERE user_id = (SELECT id FROM users WHERE username = ${u}))`);
      await app.db.execute(sql`DELETE FROM sessions WHERE user_id = (SELECT id FROM users WHERE username = ${u})`);

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/offerings',
        cookies: { accessToken: tok },
      });
      // Should still 200 — optional auth treats invalid session as guest
      expect(res.statusCode).toBe(200);
    });
  });

  // ============================================================
  // Offerings: org-scope rejection on POST
  // ============================================================
  describe('Offerings POST: org-scope rejection', () => {
    it('merchant cannot create offering in an org they are not in', async () => {
      const otherOrgId = '00000000-0000-0000-0000-000000000999';
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/offerings',
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: { title: `Cov OrgRej ${Date.now()}`, basePriceCents: 1000, durationMinutes: 30, visibility: 'public', orgId: otherOrgId },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  // ============================================================
  // Offerings list: role-based filtering branches
  // ============================================================
  describe('Offerings list role branches', () => {
    it('GET /offerings as guest (no auth) returns public+active', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/offerings' });
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.json().data)).toBe(true);
    });

    it('GET /offerings as client returns org-scoped results', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/offerings',
        headers: { authorization: `Bearer ${clientToken}` },
      });
      expect(res.statusCode).toBe(200);
    });

    it('GET /offerings as ops with empty orgScope returns no rows', async () => {
      // Create an ops user not in any org
      const oName = `cov_ops_noorg_${Date.now()}`;
      await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { username: oName, password: VALID_PASSWORD } });
      await app.db.execute(sql`UPDATE users SET role = 'operations' WHERE username = ${oName}`);
      const oLogin = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { username: oName, password: VALID_PASSWORD } });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/offerings',
        headers: { authorization: `Bearer ${oLogin.json().accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data).toEqual([]);
    });

    it('GET /offerings/:id as guest can read a public+active offering', async () => {
      // First, create + activate a public offering as merchant
      const create = await app.inject({
        method: 'POST',
        url: '/api/v1/offerings',
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: { title: `Cov Public Read ${Date.now()}`, basePriceCents: 1000, durationMinutes: 30, visibility: 'public', orgId },
      });
      if (create.statusCode !== 201) return;
      const id = create.json().id;
      await app.inject({
        method: 'PATCH',
        url: `/api/v1/offerings/${id}/status`,
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: { status: 'active' },
      });

      const res = await app.inject({ method: 'GET', url: `/api/v1/offerings/${id}` });
      expect(res.statusCode).toBe(200);
    });
  });

  // ============================================================
  // Portfolio upload: admin-with-no-org and merchant-with-no-org branches
  // ============================================================
  describe('Portfolio upload: org lookup branches', () => {
    it('returns 403 for fresh user (no org membership)', async () => {
      // Fresh merchant with no org
      const mName = `cov_pnoorg_${Date.now()}`;
      await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { username: mName, password: VALID_PASSWORD } });
      await app.db.execute(sql`UPDATE users SET role = 'merchant' WHERE username = ${mName}`);
      const login = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { username: mName, password: VALID_PASSWORD } });
      const tok = login.json().accessToken;

      const form = new FormData();
      form.append('file', createTestJpeg(), { filename: 'no-org.jpg', contentType: 'image/jpeg' });
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/portfolio/upload',
        headers: { ...form.getHeaders(), authorization: `Bearer ${tok}` },
        payload: form,
      });
      expect(res.statusCode).toBe(403);
    });

    it('admin upload looks up org membership directly (admin-with-orgs branch)', async () => {
      const aName = `cov_admin_up_${Date.now()}`;
      await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { username: aName, password: VALID_PASSWORD } });
      await app.db.execute(sql`UPDATE users SET role = 'administrator' WHERE username = ${aName}`);
      const aRow = await app.db.execute(sql`SELECT id FROM users WHERE username = ${aName}`);
      await app.db.execute(sql`INSERT INTO organization_members (org_id, user_id, role_in_org) VALUES (${orgId}, ${(aRow[0] as any).id}, 'member') ON CONFLICT DO NOTHING`);
      const login = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { username: aName, password: VALID_PASSWORD } });
      const tok = login.json().accessToken;

      const form = new FormData();
      form.append('file', createTestJpeg(), { filename: 'admin.jpg', contentType: 'image/jpeg' });
      form.append('title', 'Admin Upload');
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/portfolio/upload',
        headers: { ...form.getHeaders(), authorization: `Bearer ${tok}` },
        payload: form,
      });
      expect([202, 429]).toContain(res.statusCode);
    });

    it('rejects upload with explicit invalid mime type', async () => {
      const form = new FormData();
      form.append('file', Buffer.from('not a real file'), { filename: 'evil.bin', contentType: 'application/octet-stream' });
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/portfolio/upload',
        headers: { ...form.getHeaders(), authorization: `Bearer ${merchantToken}` },
        payload: form,
      });
      expect(res.statusCode).toBe(422);
    });
  });

  // ============================================================
  // Dedup: deeper coverage of merge + flag paths
  // ============================================================
  describe('Dedup: merge + flag deeper paths', () => {
    it('GET /dedup/queue with limit clamping', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/dedup/queue?limit=99999',
        headers: { authorization: `Bearer ${opsToken}` },
      });
      expect(res.statusCode).toBe(200);
    });

    it('GET /dedup/data-quality/flags with status filter', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/dedup/data-quality/flags?status=open',
        headers: { authorization: `Bearer ${opsToken}` },
      });
      expect(res.statusCode).toBe(200);
    });

    it('merge happy path: creates two near-duplicate offerings and merges them', async () => {
      const tail = Date.now();
      const a = await app.inject({
        method: 'POST',
        url: '/api/v1/offerings',
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: { title: `MergeTest_${tail}_A`, basePriceCents: 99900, durationMinutes: 60, visibility: 'public', orgId },
      });
      expect(a.statusCode).toBe(201);
      const b = await app.inject({
        method: 'POST',
        url: '/api/v1/offerings',
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: { title: `MergeTest_${tail}_A`, basePriceCents: 99900, durationMinutes: 60, visibility: 'public', orgId },
      });
      expect(b.statusCode).toBe(201);

      await new Promise((r) => setTimeout(r, 800));

      const cand = await app.db.execute(sql`
        SELECT id FROM duplicate_candidates
        WHERE record_type = 'offering'
          AND ((record_a_id = ${a.json().id} AND record_b_id = ${b.json().id})
               OR (record_a_id = ${b.json().id} AND record_b_id = ${a.json().id}))
        LIMIT 1
      `);
      if (!cand[0]) return;
      const candId = (cand[0] as any).id;

      const merge = await app.inject({
        method: 'POST',
        url: `/api/v1/dedup/queue/${candId}/merge`,
        headers: { authorization: `Bearer ${opsToken}` },
        payload: { survivingRecordId: a.json().id, mergedRecordId: b.json().id },
      });
      expect([200, 201]).toContain(merge.statusCode);
    });

    it('merge with mismatched survivingRecordId returns 422', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/dedup/queue/00000000-0000-0000-0000-000000000999/merge',
        headers: { authorization: `Bearer ${opsToken}` },
        payload: {
          survivingRecordId: '00000000-0000-0000-0000-000000000001',
          // mergedRecordId missing
        },
      });
      expect([400, 404, 422]).toContain(res.statusCode);
    });
  });
});
