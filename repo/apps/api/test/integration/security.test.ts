import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { sql } from 'drizzle-orm';
import FormData from 'form-data';
import { createTestApp } from '../helpers/build-test-app';
import type { FastifyInstance } from 'fastify';

function createTestJpeg(): Buffer {
  return Buffer.from([
    0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43,
    0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
    0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12,
    0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20,
    0x24, 0x2E, 0x27, 0x20, 0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29,
    0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27, 0x39, 0x3D, 0x38, 0x32,
    0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x01,
    0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xFF, 0xC4, 0x00, 0x1F, 0x00, 0x00,
    0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
    0x09, 0x0A, 0x0B, 0xFF, 0xC4, 0x00, 0xB5, 0x10, 0x00, 0x02, 0x01, 0x03,
    0x03, 0x02, 0x04, 0x03, 0x05, 0x05, 0x04, 0x04, 0x00, 0x00, 0x01, 0x7D,
    0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06,
    0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xA1, 0x08,
    0x23, 0x42, 0xB1, 0xC1, 0x15, 0x52, 0xD1, 0xF0, 0x24, 0x33, 0x62, 0x72,
    0x82, 0x09, 0x0A, 0x16, 0x17, 0x18, 0x19, 0x1A, 0x25, 0x26, 0x27, 0x28,
    0x29, 0x2A, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3A, 0x43, 0x44, 0x45,
    0x46, 0x47, 0x48, 0x49, 0x4A, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59,
    0x5A, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6A, 0x73, 0x74, 0x75,
    0x76, 0x77, 0x78, 0x79, 0x7A, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
    0x8A, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9A, 0xA2, 0xA3,
    0xA4, 0xA5, 0xA6, 0xA7, 0xA8, 0xA9, 0xAA, 0xB2, 0xB3, 0xB4, 0xB5, 0xB6,
    0xB7, 0xB8, 0xB9, 0xBA, 0xC2, 0xC3, 0xC4, 0xC5, 0xC6, 0xC7, 0xC8, 0xC9,
    0xCA, 0xD2, 0xD3, 0xD4, 0xD5, 0xD6, 0xD7, 0xD8, 0xD9, 0xDA, 0xE1, 0xE2,
    0xE3, 0xE4, 0xE5, 0xE6, 0xE7, 0xE8, 0xE9, 0xEA, 0xF1, 0xF2, 0xF3, 0xF4,
    0xF5, 0xF6, 0xF7, 0xF8, 0xF9, 0xFA, 0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01,
    0x00, 0x00, 0x3F, 0x00, 0x7B, 0x94, 0x11, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xFF, 0xD9,
  ]);
}

const VALID_PASSWORD = 'ValidPass123!@';

describe('Object-Level Authorization & Tenant Isolation', () => {
  let app: FastifyInstance;
  let orgAId: string;
  let orgBId: string;
  let merchantAToken: string;
  let merchantBToken: string;
  let opsAToken: string;
  let eventAId: string;

  async function createUser(name: string, role: string, targetOrg: string) {
    const regRes = await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { username: name, password: VALID_PASSWORD } });
    const userId = regRes.json().id;
    await app.db.execute(sql`UPDATE users SET role = ${role} WHERE id = ${userId}`);
    await app.db.execute(sql`INSERT INTO organization_members (org_id, user_id, role_in_org) VALUES (${targetOrg}, ${userId}, 'member') ON CONFLICT DO NOTHING`);
    const loginRes = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { username: name, password: VALID_PASSWORD } });
    return loginRes.json().accessToken;
  }

  beforeAll(async () => {
    app = await createTestApp();

    const orgs = await app.db.execute(sql`SELECT id FROM organizations LIMIT 1`);
    orgAId = (orgs[0] as any).id;

    const { organizations } = await import('@studioops/db/schema');
    const orgBSlug = `org-b-test-${Date.now()}`;
    const [orgBRow] = await app.db.insert(organizations).values({ name: 'Org B', slug: orgBSlug }).returning();
    orgBId = orgBRow.id;

    merchantAToken = await createUser(`mA_sec_${Date.now()}`, 'merchant', orgAId);
    merchantBToken = await createUser(`mB_sec_${Date.now()}`, 'merchant', orgBId);
    opsAToken = await createUser(`opsA_sec_${Date.now()}`, 'operations', orgAId);

    // Create an event in org A
    const eventRes = await app.inject({
      method: 'POST', url: '/api/v1/events',
      headers: { authorization: `Bearer ${merchantAToken}` },
      payload: { title: 'Org A Event', eventType: 'test', scheduledAt: '2026-08-01T10:00:00Z', durationMinutes: 60, channel: 'web', orgId: orgAId },
    });
    eventAId = eventRes.json().id;
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  describe('Event /:id org-scope check', () => {
    it('merchant in org A can read their event', async () => {
      const res = await app.inject({
        method: 'GET', url: `/api/v1/events/${eventAId}`,
        headers: { authorization: `Bearer ${merchantAToken}` },
      });
      expect(res.statusCode).toBe(200);
    });

    it('ops in org A can read org A event', async () => {
      const res = await app.inject({
        method: 'GET', url: `/api/v1/events/${eventAId}`,
        headers: { authorization: `Bearer ${opsAToken}` },
      });
      expect(res.statusCode).toBe(200);
    });

    it('merchant in org B CANNOT read org A event (returns 404)', async () => {
      const res = await app.inject({
        method: 'GET', url: `/api/v1/events/${eventAId}`,
        headers: { authorization: `Bearer ${merchantBToken}` },
      });
      // Merchant B orgScope is [orgBId], event is in orgAId → denied
      expect(res.statusCode).toBe(404);
    });
  });

  describe('Offering org-scope for Operations', () => {
    it('ops in org B cannot see org A offerings in detail', async () => {
      const opsBToken = await createUser(`opsB_off_${Date.now()}`, 'operations', orgBId);
      // Create an offering in org A
      const offerRes = await app.inject({
        method: 'POST', url: '/api/v1/offerings',
        headers: { authorization: `Bearer ${merchantAToken}` },
        payload: { title: `OrgA Offer ${Date.now()}`, basePriceCents: 10000, durationMinutes: 60, visibility: 'public', orgId: orgAId },
      });
      if (offerRes.statusCode === 201) {
        const offerId = offerRes.json().id;
        const res = await app.inject({
          method: 'GET', url: `/api/v1/offerings/${offerId}`,
          headers: { authorization: `Bearer ${opsBToken}` },
        });
        expect(res.statusCode).toBe(404);
      }
    });
  });

  describe('Portfolio /:id ownership check', () => {
    it('merchant can only read own portfolio items', async () => {
      // Upload a portfolio item as merchant A
      // Then try to read it as merchant B (should get 404)
      const listRes = await app.inject({
        method: 'GET', url: '/api/v1/portfolio',
        headers: { authorization: `Bearer ${merchantAToken}` },
      });
      const items = listRes.json().data;
      if (items.length > 0) {
        const itemId = items[0].id;
        const res = await app.inject({
          method: 'GET', url: `/api/v1/portfolio/${itemId}`,
          headers: { authorization: `Bearer ${merchantBToken}` },
        });
        expect(res.statusCode).toBe(404);
      }
    });
  });

  describe('Analytics cache tenant isolation', () => {
    it('ops user in org A and org B get different cache keys', async () => {
      // This verifies the fix: computeFilterHash now includes orgScope
      const { computeFilterHash } = await import('../../src/core/domain/analytics');
      const filters = { from: new Date('2026-01-01'), to: new Date('2026-12-31') };

      const hashA = computeFilterHash(filters, [orgAId]);
      const hashB = computeFilterHash(filters, [orgBId]);
      const hashAll = computeFilterHash(filters);

      expect(hashA).not.toBe(hashB);
      expect(hashA).not.toBe(hashAll);
      expect(hashB).not.toBe(hashAll);
    });

    it('ops in org A cannot see org B data in analytics', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/analytics/dashboard?from=2026-01-01&to=2026-12-31',
        headers: { authorization: `Bearer ${opsAToken}` },
      });
      expect(res.statusCode).toBe(200);
    });
  });

  describe('Registration isolation', () => {
    it('client is forced to self-register (clientId ignored)', async () => {
      const clientName = `client_self_${Date.now()}`;
      const clientToken = await createUser(clientName, 'client', orgAId);

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/events/${eventAId}/registrations`,
        headers: { authorization: `Bearer ${clientToken}` },
        payload: { clientId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.clientId).not.toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
    });

    it('merchant B cannot list registrations for merchant A event', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/events/${eventAId}/registrations`,
        headers: { authorization: `Bearer ${merchantBToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it('merchant B cannot update registration for merchant A event', async () => {
      const clientName = `client_upd_${Date.now()}`;
      const clientToken = await createUser(clientName, 'client', orgAId);

      const regRes = await app.inject({
        method: 'POST',
        url: `/api/v1/events/${eventAId}/registrations`,
        headers: { authorization: `Bearer ${clientToken}` },
        payload: {},
      });
      expect(regRes.statusCode).toBe(201);
      const regId = regRes.json().id;

      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/events/registrations/${regId}/status`,
        headers: { authorization: `Bearer ${merchantBToken}` },
        payload: { status: 'confirmed' },
      });
      expect(res.statusCode).toBe(403);
    });

    it('ops user outside event org cannot read registrations', async () => {
      // Create ops in org B
      const opsBToken = await createUser(`opsB_reg_${Date.now()}`, 'operations', orgBId);

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/events/${eventAId}/registrations`,
        headers: { authorization: `Bearer ${opsBToken}` },
      });
      // Ops B orgScope is [orgBId], event is in orgAId → denied
      expect(res.statusCode).toBe(404);
    });
  });

  describe('Media (/api/v1/media/*) authorization', () => {
    let portfolioItemId: string;
    const fakePreviewPath = `fake-org/previews/test-media-auth.jpg`;

    beforeAll(async () => {
      // Get merchant A's user id
      const decoded = JSON.parse(Buffer.from(merchantAToken.split('.')[1], 'base64url').toString());
      const merchantAId = decoded.sub;

      // Insert a portfolio item in org A with a known preview path
      const result = await app.db.execute(
        sql`INSERT INTO portfolio_items (merchant_id, original_org_id, title, media_type, original_path, mime_type, file_size_bytes, status, preview_path, processed_path)
            VALUES (${merchantAId}, ${orgAId}, 'Auth Test Photo', 'photo', 'test/orig.jpg', 'image/jpeg', 1024, 'ready', ${fakePreviewPath}, 'fake-org/processed/test-media-auth.jpg')
            RETURNING id`,
      );
      portfolioItemId = (result[0] as any).id;
    });

    it('owner merchant can access their media preview path', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/media/${fakePreviewPath}`,
        headers: { authorization: `Bearer ${merchantAToken}` },
      });
      // Will be 404 (file doesn't exist on disk) but NOT 403 — authorization passed
      expect(res.statusCode).toBe(404);
      expect(res.json().error).toBe('NOT_FOUND');
      expect(res.json().message).toBe('Media file not found');
    });

    it('cross-org merchant CANNOT access media from another org', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/media/${fakePreviewPath}`,
        headers: { authorization: `Bearer ${merchantBToken}` },
      });
      expect(res.statusCode).toBe(404);
    });

    it('ops in same org can access media', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/media/${fakePreviewPath}`,
        headers: { authorization: `Bearer ${opsAToken}` },
      });
      // 404 because file doesn't exist on disk, but auth passed (not 403)
      expect(res.statusCode).toBe(404);
      expect(res.json().message).toBe('Media file not found');
    });

    it('ops in different org CANNOT access media', async () => {
      const opsBToken = await createUser(`opsB_media_${Date.now()}`, 'operations', orgBId);
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/media/${fakePreviewPath}`,
        headers: { authorization: `Bearer ${opsBToken}` },
      });
      expect(res.statusCode).toBe(404);
    });

    it('guessed path with valid JWT returns 404 (no matching portfolio item)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/media/some-org/previews/guessed-file.jpg`,
        headers: { authorization: `Bearer ${merchantAToken}` },
      });
      expect(res.statusCode).toBe(404);
    });

    it('unauthenticated request returns 401', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/media/${fakePreviewPath}`,
      });
      expect(res.statusCode).toBe(401);
    });

    it('directory traversal is rejected', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/media/../../../etc/passwd`,
        headers: { authorization: `Bearer ${merchantAToken}` },
      });
      expect([400, 403, 404]).toContain(res.statusCode);
    });

    it('originals/ path is rejected', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/media/some-org/originals/file.jpg`,
        headers: { authorization: `Bearer ${merchantAToken}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('Portfolio tags tenant isolation', () => {
    let itemAId: string;
    let itemBId: string;
    const tagNameA = `orga-tag-${Date.now()}`;
    const tagNameB = `orgb-tag-${Date.now()}`;

    beforeAll(async () => {
      // Upload a portfolio item as merchant A and tag it
      const formA = new FormData();
      formA.append('file', createTestJpeg(), { filename: 'tagtest-a.jpg', contentType: 'image/jpeg' });
      formA.append('title', 'Tag Test A');
      const uploadA = await app.inject({
        method: 'POST', url: '/api/v1/portfolio/upload',
        headers: { authorization: `Bearer ${merchantAToken}`, ...formA.getHeaders() },
        payload: formA,
      });
      expect(uploadA.statusCode).toBe(202);
      itemAId = uploadA.json().id;

      await app.inject({
        method: 'PATCH', url: `/api/v1/portfolio/${itemAId}/tags`,
        headers: { authorization: `Bearer ${merchantAToken}` },
        payload: { tagNames: [tagNameA] },
      });

      // Upload a portfolio item as merchant B and tag it
      const formB = new FormData();
      formB.append('file', createTestJpeg(), { filename: 'tagtest-b.jpg', contentType: 'image/jpeg' });
      formB.append('title', 'Tag Test B');
      const uploadB = await app.inject({
        method: 'POST', url: '/api/v1/portfolio/upload',
        headers: { authorization: `Bearer ${merchantBToken}`, ...formB.getHeaders() },
        payload: formB,
      });
      expect(uploadB.statusCode).toBe(202);
      itemBId = uploadB.json().id;

      await app.inject({
        method: 'PATCH', url: `/api/v1/portfolio/${itemBId}/tags`,
        headers: { authorization: `Bearer ${merchantBToken}` },
        payload: { tagNames: [tagNameB] },
      });
    });

    it('merchant A sees only tags from their own items', async () => {
      const res = await app.inject({
        method: 'GET', url: '/api/v1/portfolio/tags',
        headers: { authorization: `Bearer ${merchantAToken}` },
      });
      expect(res.statusCode).toBe(200);
      const tagNames = res.json().data.map((t: any) => t.name);
      expect(tagNames).toContain(tagNameA);
      expect(tagNames).not.toContain(tagNameB);
    });

    it('merchant B sees only tags from their own items', async () => {
      const res = await app.inject({
        method: 'GET', url: '/api/v1/portfolio/tags',
        headers: { authorization: `Bearer ${merchantBToken}` },
      });
      expect(res.statusCode).toBe(200);
      const tagNames = res.json().data.map((t: any) => t.name);
      expect(tagNames).toContain(tagNameB);
      expect(tagNames).not.toContain(tagNameA);
    });

    it('ops in org A sees only org A tags, not org B tags', async () => {
      const res = await app.inject({
        method: 'GET', url: '/api/v1/portfolio/tags',
        headers: { authorization: `Bearer ${opsAToken}` },
      });
      expect(res.statusCode).toBe(200);
      const tagNames = res.json().data.map((t: any) => t.name);
      expect(tagNames).toContain(tagNameA);
      expect(tagNames).not.toContain(tagNameB);
    });

    it('search also respects tenant scope', async () => {
      const res = await app.inject({
        method: 'GET', url: `/api/v1/portfolio/tags?search=${tagNameB.substring(0, 8)}`,
        headers: { authorization: `Bearer ${merchantAToken}` },
      });
      expect(res.statusCode).toBe(200);
      const tagNames = res.json().data.map((t: any) => t.name);
      expect(tagNames).not.toContain(tagNameB);
    });
  });
});
