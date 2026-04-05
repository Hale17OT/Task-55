import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { createTestApp } from '../helpers/build-test-app';
import type { FastifyInstance } from 'fastify';

const VALID_PASSWORD = 'ValidPass123!@';

describe('Offerings Routes', () => {
  let app: FastifyInstance;
  let merchantToken: string;
  let merchantUserId: string;
  let clientToken: string;
  let clientUserId: string;
  let orgId: string;

  beforeAll(async () => {
    app = await createTestApp();

    // Get default org
    const orgs = await app.db.execute(sql`SELECT id FROM organizations LIMIT 1`);
    orgId = (orgs[0] as any).id;

    // Create and login merchant
    const mName = `m_offer_${Date.now()}`;
    await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { username: mName, password: VALID_PASSWORD } });
    await app.db.execute(sql`UPDATE users SET role = 'merchant' WHERE username = ${mName}`);

    // Add merchant to org
    const mUser = await app.db.execute(sql`SELECT id FROM users WHERE username = ${mName}`);
    merchantUserId = (mUser[0] as any).id;
    await app.db.execute(sql`INSERT INTO organization_members (org_id, user_id, role_in_org) VALUES (${orgId}, ${merchantUserId}, 'member')`);

    const mLogin = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { username: mName, password: VALID_PASSWORD } });
    merchantToken = mLogin.json().accessToken;

    // Create and login client (with org membership for org-scoped access)
    const cName = `c_offer_${Date.now()}`;
    await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { username: cName, password: VALID_PASSWORD } });
    const cUser = await app.db.execute(sql`SELECT id FROM users WHERE username = ${cName}`);
    clientUserId = (cUser[0] as any).id;
    await app.db.execute(sql`INSERT INTO organization_members (org_id, user_id, role_in_org) VALUES (${orgId}, ${clientUserId}, 'member') ON CONFLICT DO NOTHING`);
    const cLogin = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { username: cName, password: VALID_PASSWORD } });
    clientToken = cLogin.json().accessToken;
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  describe('POST /api/v1/offerings', () => {
    it('creates offering and returns 201', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/offerings',
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: {
          title: 'Wedding Essentials',
          description: 'Full day coverage',
          basePriceCents: 250000,
          durationMinutes: 360,
          visibility: 'public',
          orgId,
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.title).toBe('Wedding Essentials');
      expect(body.basePriceCents).toBe(250000);
      expect(body.durationMinutes).toBe(360);
      expect(body.status).toBe('draft');
      expect(body.merchantId).toBe(merchantUserId);
    });

    it('returns 400 for invalid body', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/offerings',
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: { title: 'AB', basePriceCents: -1, durationMinutes: 0, orgId },
      });

      expect(res.statusCode).toBe(400);
    });

    it('returns 403 for client role', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/offerings',
        headers: { authorization: `Bearer ${clientToken}` },
        payload: { title: 'Test', basePriceCents: 1000, durationMinutes: 60, orgId },
      });

      expect(res.statusCode).toBe(403);
    });
  });

  describe('GET /api/v1/offerings', () => {
    it('returns paginated offerings', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/offerings',
        headers: { authorization: `Bearer ${merchantToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data).toBeInstanceOf(Array);
      expect(body.meta.page).toBe(1);
      expect(body.meta.total).toBeGreaterThan(0);
    });
  });

  describe('Offering lifecycle', () => {
    let offeringId: string;

    beforeAll(async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/offerings',
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: {
          title: 'Corporate Headshots',
          basePriceCents: 45000,
          durationMinutes: 90,
          orgId,
        },
      });
      offeringId = res.json().id;
    });

    it('GET /offerings/:id returns offering with addons', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/offerings/${offeringId}`,
        headers: { authorization: `Bearer ${merchantToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().addons).toBeInstanceOf(Array);
    });

    it('PUT /offerings/:id updates offering', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: `/api/v1/offerings/${offeringId}`,
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: { title: 'Corporate Headshots Premium' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().title).toBe('Corporate Headshots Premium');
    });

    it('PATCH /offerings/:id/status transitions draft → active', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/offerings/${offeringId}/status`,
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: { status: 'active' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe('active');
    });

    it('PATCH /offerings/:id/status transitions active → archived', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/offerings/${offeringId}/status`,
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: { status: 'archived' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe('archived');
    });

    it('PUT returns 409 for archived offering', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: `/api/v1/offerings/${offeringId}`,
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: { title: 'Should Fail' },
      });

      expect(res.statusCode).toBe(409);
    });

    it('PATCH status returns 409 for invalid transition (archived → active)', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/offerings/${offeringId}/status`,
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: { status: 'active' },
      });

      expect(res.statusCode).toBe(409);
    });
  });

  describe('Add-ons', () => {
    let offeringId: string;
    let addonId: string;

    beforeAll(async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/offerings',
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: { title: 'Addon Test Package', basePriceCents: 100000, durationMinutes: 120, orgId },
      });
      offeringId = res.json().id;
    });

    it('POST /offerings/:id/addons creates addon', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/offerings/${offeringId}/addons`,
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: { name: 'Extra Retouched Images', priceCents: 1500, unitDescription: 'each' },
      });

      expect(res.statusCode).toBe(201);
      addonId = res.json().id;
      expect(res.json().name).toBe('Extra Retouched Images');
      expect(res.json().priceCents).toBe(1500);
    });

    it('DELETE /offerings/:id/addons/:addonId returns 204', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/offerings/${offeringId}/addons/${addonId}`,
        headers: { authorization: `Bearer ${merchantToken}` },
      });

      expect(res.statusCode).toBe(204);
    });
  });

  describe('Prices are integers', () => {
    it('all prices in responses are integers', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/offerings',
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: { title: 'Integer Price Test', basePriceCents: 250000, durationMinutes: 360, orgId },
      });

      const body = res.json();
      expect(Number.isInteger(body.basePriceCents)).toBe(true);
      expect(Number.isInteger(body.durationMinutes)).toBe(true);
    });
  });

  describe('Visibility', () => {
    it('GET /offerings/:id returns 404 for private offering accessed by non-owner', async () => {
      // Create private offering
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/offerings',
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: { title: 'Private Package', basePriceCents: 50000, durationMinutes: 60, visibility: 'private', orgId },
      });
      const privateId = createRes.json().id;

      // Client tries to access
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/offerings/${privateId}`,
        headers: { authorization: `Bearer ${clientToken}` },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe('Restricted offering access grants', () => {
    let restrictedId: string;

    beforeAll(async () => {
      // Create restricted offering
      const res = await app.inject({
        method: 'POST', url: '/api/v1/offerings',
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: { title: 'Restricted Package', basePriceCents: 100000, durationMinutes: 60, visibility: 'restricted', orgId },
      });
      restrictedId = res.json().id;

      // Activate it
      await app.inject({
        method: 'PATCH', url: `/api/v1/offerings/${restrictedId}/status`,
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: { status: 'active' },
      });
    });

    it('client cannot see restricted offering before grant', async () => {
      const res = await app.inject({
        method: 'GET', url: `/api/v1/offerings/${restrictedId}`,
        headers: { authorization: `Bearer ${clientToken}` },
      });
      expect(res.statusCode).toBe(404);
    });

    it('merchant can grant access to client', async () => {
      const res = await app.inject({
        method: 'POST', url: `/api/v1/offerings/${restrictedId}/access`,
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: { userIds: [clientUserId] },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().granted).toBe(1);
    });

    it('client can see restricted offering after grant', async () => {
      const res = await app.inject({
        method: 'GET', url: `/api/v1/offerings/${restrictedId}`,
        headers: { authorization: `Bearer ${clientToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().title).toBe('Restricted Package');
    });

    it('merchant can revoke access', async () => {
      const res = await app.inject({
        method: 'DELETE', url: `/api/v1/offerings/${restrictedId}/access/${clientUserId}`,
        headers: { authorization: `Bearer ${merchantToken}` },
      });
      expect(res.statusCode).toBe(204);
    });

    it('client cannot see restricted offering after revoke', async () => {
      const res = await app.inject({
        method: 'GET', url: `/api/v1/offerings/${restrictedId}`,
        headers: { authorization: `Bearer ${clientToken}` },
      });
      expect(res.statusCode).toBe(404);
    });
  });
});
