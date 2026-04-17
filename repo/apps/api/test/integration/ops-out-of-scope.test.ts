import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { createTestApp } from '../helpers/build-test-app';
import type { FastifyInstance } from 'fastify';

const VALID_PASSWORD = 'ValidPass123!@';

/**
 * Ops-out-of-scope branch coverage.
 *
 * The offering/portfolio/event routes all contain an explicit
 * "if (request.user.role === 'operations' && !orgScope.includes(orgId)) 404"
 * defense-in-depth check. These are only reachable when the ops role has the
 * corresponding permission (offering:update, portfolio:update/delete,
 * event:update, etc.).
 *
 * In the seeded role_permissions table, ops lacks those update perms — so the
 * authorize middleware blocks with 403 before the route body runs, and the
 * defense-in-depth branch becomes unreachable. To exercise it, we grant the
 * missing perms for the lifetime of this file only. No existing test expects
 * ops to be denied these specific actions (verified via grep), so cross-file
 * pollution is harmless.
 */
describe('Ops out-of-scope defense-in-depth route branches', () => {
  let app: FastifyInstance;
  let opsInOtherOrgToken: string;
  let merchantToken: string;
  let merchantId: string;
  let clientId: string;
  let orgId: string;
  let otherOrgId: string;
  let grantedPermissionIds: string[] = [];

  beforeAll(async () => {
    app = await createTestApp();

    const orgs = await app.db.execute(sql`SELECT id FROM organizations LIMIT 1`);
    orgId = (orgs[0] as any).id;

    otherOrgId = crypto.randomUUID();
    await app.db.execute(
      sql`INSERT INTO organizations (id, name, slug) VALUES (${otherOrgId}, 'Ops Other Org', ${`ops-other-${Date.now()}`})`,
    );

    // Grant missing 'update' perms to operations so the defense-in-depth
    // route-body check becomes reachable. Record what we granted so afterAll
    // can revoke.
    const perms = await app.db.execute(sql`
      SELECT id FROM permissions
      WHERE (resource, action) IN (
        ('offering', 'create'), ('offering', 'update'),
        ('portfolio', 'update'), ('portfolio', 'delete'),
        ('event', 'create'), ('event', 'update')
      )
    `);
    for (const row of perms as any[]) {
      const pid = row.id;
      const existing = await app.db.execute(sql`
        SELECT 1 FROM role_permissions WHERE role = 'operations' AND permission_id = ${pid}
      `);
      if (existing.length === 0) {
        await app.db.execute(sql`INSERT INTO role_permissions (role, permission_id) VALUES ('operations', ${pid})`);
        grantedPermissionIds.push(pid);
      }
    }

    const ts = Date.now();
    // Merchant in the primary org
    const mName = `oops_merch_${ts}`;
    await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { username: mName, password: VALID_PASSWORD } });
    await app.db.execute(sql`UPDATE users SET role = 'merchant' WHERE username = ${mName}`);
    const mUser = await app.db.execute(sql`SELECT id FROM users WHERE username = ${mName}`);
    merchantId = (mUser[0] as any).id;
    await app.db.execute(sql`INSERT INTO organization_members (org_id, user_id, role_in_org) VALUES (${orgId}, ${merchantId}, 'member') ON CONFLICT DO NOTHING`);
    merchantToken = (await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { username: mName, password: VALID_PASSWORD } })).json().accessToken;

    // Client in primary org (for restricted-grant targets)
    const cName = `oops_client_${ts}`;
    await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { username: cName, password: VALID_PASSWORD } });
    const cUser = await app.db.execute(sql`SELECT id FROM users WHERE username = ${cName}`);
    clientId = (cUser[0] as any).id;
    await app.db.execute(sql`INSERT INTO organization_members (org_id, user_id, role_in_org) VALUES (${orgId}, ${clientId}, 'member') ON CONFLICT DO NOTHING`);

    // Ops user — member of the OTHER org only (so they're out of scope for primary org)
    const oName = `oops_ops_other_${ts}`;
    await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { username: oName, password: VALID_PASSWORD } });
    await app.db.execute(sql`UPDATE users SET role = 'operations' WHERE username = ${oName}`);
    const oUser = await app.db.execute(sql`SELECT id FROM users WHERE username = ${oName}`);
    await app.db.execute(sql`INSERT INTO organization_members (org_id, user_id, role_in_org) VALUES (${otherOrgId}, ${(oUser[0] as any).id}, 'member') ON CONFLICT DO NOTHING`);
    opsInOtherOrgToken = (await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { username: oName, password: VALID_PASSWORD } })).json().accessToken;
  });

  afterAll(async () => {
    // Revoke the ops perms we granted
    if (grantedPermissionIds.length > 0) {
      for (const pid of grantedPermissionIds) {
        await app.db.execute(sql`DELETE FROM role_permissions WHERE role = 'operations' AND permission_id = ${pid}`);
      }
    }
    if (app) await app.close();
  });

  describe('Offerings routes — ops out-of-scope 404', () => {
    let offeringId: string;
    beforeAll(async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/offerings',
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: { title: `oops_off_${Date.now()}`, basePriceCents: 10000, durationMinutes: 60, orgId },
      });
      expect(res.statusCode).toBe(201);
      offeringId = res.json().id;
    });

    it('PUT /offerings/:id — ops out of scope → 404', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: `/api/v1/offerings/${offeringId}`,
        headers: { authorization: `Bearer ${opsInOtherOrgToken}` },
        payload: { title: 'mod' },
      });
      expect(res.statusCode).toBe(404);
    });

    it('PATCH /offerings/:id/status — ops out of scope → 404', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/offerings/${offeringId}/status`,
        headers: { authorization: `Bearer ${opsInOtherOrgToken}` },
        payload: { status: 'active' },
      });
      expect(res.statusCode).toBe(404);
    });

    it('POST /offerings/:id/addons — ops out of scope → 404', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/offerings/${offeringId}/addons`,
        headers: { authorization: `Bearer ${opsInOtherOrgToken}` },
        payload: { name: 'addon', priceCents: 500, unitDescription: 'per hour' },
      });
      expect(res.statusCode).toBe(404);
    });

    it('DELETE /offerings/:id/addons/:addonId — ops out of scope → 404', async () => {
      const fake = '00000000-0000-0000-0000-000000000444';
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/offerings/${offeringId}/addons/${fake}`,
        headers: { authorization: `Bearer ${opsInOtherOrgToken}` },
      });
      expect(res.statusCode).toBe(404);
    });

    it('POST /offerings/:id/access — ops out of scope → 404', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/offerings/${offeringId}/access`,
        headers: { authorization: `Bearer ${opsInOtherOrgToken}` },
        payload: { userIds: [clientId] },
      });
      expect(res.statusCode).toBe(404);
    });

    it('DELETE /offerings/:id/access/:userId — ops out of scope → 404', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/offerings/${offeringId}/access/${clientId}`,
        headers: { authorization: `Bearer ${opsInOtherOrgToken}` },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('Portfolio routes — ops out-of-scope 404/403', () => {
    let itemId: string;
    beforeAll(async () => {
      const r = await app.db.execute(sql`
        INSERT INTO portfolio_items (merchant_id, original_org_id, title, media_type, original_path, mime_type, file_size_bytes, status)
        VALUES (${merchantId}, ${orgId}, 'Ops Out Item', 'photo', 'oops/a.jpg', 'image/jpeg', 1024, 'ready') RETURNING id
      `);
      itemId = (r[0] as any).id;
    });

    it('DELETE /portfolio/:id — ops out of scope → 404', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/portfolio/${itemId}`,
        headers: { authorization: `Bearer ${opsInOtherOrgToken}` },
      });
      expect(res.statusCode).toBe(404);
    });

    it('PATCH /portfolio/:id/tags — ops out of scope → 404', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/portfolio/${itemId}/tags`,
        headers: { authorization: `Bearer ${opsInOtherOrgToken}` },
        payload: { tagNames: ['x'] },
      });
      expect(res.statusCode).toBe(404);
    });

    it('PATCH /portfolio/:id/category — ops out of scope → 404', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/portfolio/${itemId}/category`,
        headers: { authorization: `Bearer ${opsInOtherOrgToken}` },
        payload: { categoryId: null },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('Events routes — ops out-of-scope 403', () => {
    let eventId: string;
    beforeAll(async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/events',
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: {
          title: `oops_ev_${Date.now()}`,
          orgId,
          eventType: 'workshop',
          scheduledAt: new Date(Date.now() + 86400_000).toISOString(),
          durationMinutes: 60,
          maxCapacity: 10,
        },
      });
      expect(res.statusCode).toBe(201);
      eventId = res.json().id;
    });

    it('PUT /events/:id — ops out of scope → 403', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: `/api/v1/events/${eventId}`,
        headers: { authorization: `Bearer ${opsInOtherOrgToken}` },
        payload: { title: 'mod' },
      });
      expect(res.statusCode).toBe(403);
    });

    it('PATCH /events/:id/status — ops out of scope → 403', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/events/${eventId}/status`,
        headers: { authorization: `Bearer ${opsInOtherOrgToken}` },
        payload: { status: 'cancelled' },
      });
      expect(res.statusCode).toBe(403);
    });
  });
});
