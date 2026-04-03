import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { createTestApp } from '../helpers/build-test-app';
import type { FastifyInstance } from 'fastify';

const VALID_PASSWORD = 'ValidPass123!@';

describe('Events & Registrations Routes', () => {
  let app: FastifyInstance;
  let merchantToken: string;
  let clientToken: string;
  let clientUserId: string;
  let orgId: string;

  beforeAll(async () => {
    app = await createTestApp();

    // Get default org
    const orgs = await app.db.execute(sql`SELECT id FROM organizations LIMIT 1`);
    orgId = (orgs[0] as any).id;

    // Create merchant
    const mName = `m_event_${Date.now()}`;
    await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { username: mName, password: VALID_PASSWORD } });
    await app.db.execute(sql`UPDATE users SET role = 'merchant' WHERE username = ${mName}`);
    const mUser = await app.db.execute(sql`SELECT id FROM users WHERE username = ${mName}`);
    await app.db.execute(sql`INSERT INTO organization_members (org_id, user_id, role_in_org) VALUES (${orgId}, ${(mUser[0] as any).id}, 'member')`);
    const mLogin = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { username: mName, password: VALID_PASSWORD } });
    merchantToken = mLogin.json().accessToken;

    // Create client (must be in same org for event access)
    const cName = `c_event_${Date.now()}`;
    await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { username: cName, password: VALID_PASSWORD } });
    const cUser = await app.db.execute(sql`SELECT id FROM users WHERE username = ${cName}`);
    clientUserId = (cUser[0] as any).id;
    await app.db.execute(sql`INSERT INTO organization_members (org_id, user_id, role_in_org) VALUES (${orgId}, ${clientUserId}, 'member')`);
    const cLogin = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { username: cName, password: VALID_PASSWORD } });
    clientToken = cLogin.json().accessToken;
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  describe('POST /api/v1/events', () => {
    it('creates event and returns 201', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/events',
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: {
          title: 'Wedding Photography Session',
          eventType: 'wedding',
          scheduledAt: '2026-06-15T10:00:00Z',
          durationMinutes: 480,
          channel: 'referral',
          tags: ['wedding', 'outdoor'],
          orgId,
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.title).toBe('Wedding Photography Session');
      expect(body.status).toBe('scheduled');
      expect(body.eventType).toBe('wedding');
      expect(body.channel).toBe('referral');
      expect(body.tags).toContain('wedding');
    });

    it('returns 403 for client role', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/events',
        headers: { authorization: `Bearer ${clientToken}` },
        payload: {
          title: 'Test', eventType: 'test',
          scheduledAt: '2026-06-15T10:00:00Z', durationMinutes: 60, orgId,
        },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('Event lifecycle', () => {
    let eventId: string;

    beforeAll(async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/events',
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: {
          title: 'Lifecycle Test Event',
          eventType: 'corporate',
          scheduledAt: '2026-07-01T09:00:00Z',
          durationMinutes: 120,
          channel: 'website',
          orgId,
        },
      });
      eventId = res.json().id;
    });

    it('GET /events lists events', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/events',
        headers: { authorization: `Bearer ${merchantToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.length).toBeGreaterThan(0);
    });

    it('GET /events/:id returns event', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/events/${eventId}`,
        headers: { authorization: `Bearer ${merchantToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().title).toBe('Lifecycle Test Event');
    });

    it('PUT /events/:id updates event', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: `/api/v1/events/${eventId}`,
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: { title: 'Updated Event Title' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().title).toBe('Updated Event Title');
    });

    it('PATCH /events/:id/status transitions scheduled → confirmed', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/events/${eventId}/status`,
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: { status: 'confirmed' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe('confirmed');
    });

    it('PATCH /events/:id/status transitions confirmed → completed', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/events/${eventId}/status`,
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: { status: 'completed' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe('completed');
    });

    it('PUT returns 409 for completed event', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: `/api/v1/events/${eventId}`,
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: { title: 'Should Fail' },
      });
      expect(res.statusCode).toBe(409);
    });
  });

  describe('Registration lifecycle', () => {
    let eventId: string;
    let registrationId: string;

    beforeAll(async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/events',
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: {
          title: 'Registration Test Event',
          eventType: 'portrait',
          scheduledAt: '2026-08-01T14:00:00Z',
          durationMinutes: 90,
          channel: 'walk-in',
          orgId,
        },
      });
      eventId = res.json().id;
    });

    it('POST /events/:eventId/registrations creates registration', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/events/${eventId}/registrations`,
        headers: { authorization: `Bearer ${clientToken}` },
        payload: {},
      });
      expect(res.statusCode).toBe(201);
      registrationId = res.json().id;
      expect(res.json().status).toBe('registered');
      expect(res.json().clientId).toBe(clientUserId);
    });

    it('GET /events/:eventId/registrations lists registrations', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/events/${eventId}/registrations`,
        headers: { authorization: `Bearer ${merchantToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.length).toBe(1);
    });

    it('PATCH /registrations/:id/status transitions registered → confirmed', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/events/registrations/${registrationId}/status`,
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: { status: 'confirmed' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe('confirmed');
      expect(res.json().confirmedAt).toBeTruthy();
    });

    it('PATCH /registrations/:id/status transitions confirmed → attended', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/events/registrations/${registrationId}/status`,
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: { status: 'attended' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe('attended');
      expect(res.json().arrivedAt).toBeTruthy();
    });

    it('PATCH rejects transition from terminal status (attended → confirmed)', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/events/registrations/${registrationId}/status`,
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: { status: 'confirmed' },
      });
      expect(res.statusCode).toBe(409);
    });
  });

  describe('Registration client isolation', () => {
    let eventId: string;

    beforeAll(async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/events',
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: { title: 'Isolation Test Event', eventType: 'test', scheduledAt: '2026-10-01T10:00:00Z', durationMinutes: 60, orgId },
      });
      eventId = res.json().id;
    });

    it('client can only see own registrations, not other clients', async () => {
      // Create a second client in the same org
      const c2Name = `c2_event_${Date.now()}`;
      await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { username: c2Name, password: VALID_PASSWORD } });
      const c2User = await app.db.execute(sql`SELECT id FROM users WHERE username = ${c2Name}`);
      const c2Id = (c2User[0] as any).id;
      await app.db.execute(sql`INSERT INTO organization_members (org_id, user_id, role_in_org) VALUES (${orgId}, ${c2Id}, 'member')`);
      const c2Login = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { username: c2Name, password: VALID_PASSWORD } });
      const c2Token = c2Login.json().accessToken;

      // Client 1 registers
      await app.inject({
        method: 'POST', url: `/api/v1/events/${eventId}/registrations`,
        headers: { authorization: `Bearer ${clientToken}` }, payload: {},
      });

      // Client 2 registers
      await app.inject({
        method: 'POST', url: `/api/v1/events/${eventId}/registrations`,
        headers: { authorization: `Bearer ${c2Token}` }, payload: {},
      });

      // Client 1 lists registrations — should only see their own
      const c1Res = await app.inject({
        method: 'GET', url: `/api/v1/events/${eventId}/registrations`,
        headers: { authorization: `Bearer ${clientToken}` },
      });
      expect(c1Res.statusCode).toBe(200);
      const c1Data = c1Res.json().data;
      expect(c1Data.length).toBe(1);
      expect(c1Data[0].clientId).toBe(clientUserId);

      // Client 2 lists registrations — should only see their own
      const c2Res = await app.inject({
        method: 'GET', url: `/api/v1/events/${eventId}/registrations`,
        headers: { authorization: `Bearer ${c2Token}` },
      });
      expect(c2Res.statusCode).toBe(200);
      const c2Data = c2Res.json().data;
      expect(c2Data.length).toBe(1);
      expect(c2Data[0].clientId).toBe(c2Id);

      // Merchant sees all registrations
      const mRes = await app.inject({
        method: 'GET', url: `/api/v1/events/${eventId}/registrations`,
        headers: { authorization: `Bearer ${merchantToken}` },
      });
      expect(mRes.statusCode).toBe(200);
      expect(mRes.json().data.length).toBe(2);
    });
  });

  describe('Registration cancellation', () => {
    let eventId: string;
    let registrationId: string;

    beforeAll(async () => {
      const eventRes = await app.inject({
        method: 'POST', url: '/api/v1/events',
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: { title: 'Cancel Test', eventType: 'test', scheduledAt: '2026-09-01T10:00:00Z', durationMinutes: 60, orgId },
      });
      eventId = eventRes.json().id;

      const regRes = await app.inject({
        method: 'POST', url: `/api/v1/events/${eventId}/registrations`,
        headers: { authorization: `Bearer ${clientToken}` }, payload: {},
      });
      registrationId = regRes.json().id;
    });

    it('cancellation includes cancelReason and cancelledAt', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/events/registrations/${registrationId}/status`,
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: { status: 'cancelled', cancelReason: 'Client requested cancellation' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe('cancelled');
      expect(res.json().cancelledAt).toBeTruthy();
      expect(res.json().cancelReason).toBe('Client requested cancellation');
    });
  });
});
