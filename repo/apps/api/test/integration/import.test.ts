import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { createTestApp } from '../helpers/build-test-app';
import type { FastifyInstance } from 'fastify';

const VALID_PASSWORD = 'ValidPass123!@';

describe('Import Routes', () => {
  let app: FastifyInstance;
  let merchantToken: string;
  let opsToken: string;
  let orgId: string;

  beforeAll(async () => {
    app = await createTestApp();
    const orgs = await app.db.execute(sql`SELECT id FROM organizations LIMIT 1`);
    orgId = (orgs[0] as any).id;

    const mName = `m_import_${Date.now()}`;
    await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { username: mName, password: VALID_PASSWORD } });
    await app.db.execute(sql`UPDATE users SET role = 'merchant' WHERE username = ${mName}`);
    const mUser = await app.db.execute(sql`SELECT id FROM users WHERE username = ${mName}`);
    await app.db.execute(sql`INSERT INTO organization_members (org_id, user_id, role_in_org) VALUES (${orgId}, ${(mUser[0] as any).id}, 'member')`);
    const mLogin = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { username: mName, password: VALID_PASSWORD } });
    merchantToken = mLogin.json().accessToken;

    // Create ops user for cleanse tests
    const opsName = `ops_import_${Date.now()}`;
    await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { username: opsName, password: VALID_PASSWORD } });
    await app.db.execute(sql`UPDATE users SET role = 'operations' WHERE username = ${opsName}`);
    const opsUser = await app.db.execute(sql`SELECT id FROM users WHERE username = ${opsName}`);
    await app.db.execute(sql`INSERT INTO organization_members (org_id, user_id, role_in_org) VALUES (${orgId}, ${(opsUser[0] as any).id}, 'member')`);
    const opsLogin = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { username: opsName, password: VALID_PASSWORD } });
    opsToken = opsLogin.json().accessToken;
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('POST /import/offerings imports batch with normalization', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/import/offerings',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: {
        orgId,
        offerings: [
          { title: 'Import Wedding Package', price: 2500, currency: 'USD', duration: 6, durationUnit: 'hours', tags: ['wedding'] },
          { title: 'Import Corporate Headshots', price: 450, currency: 'USD', duration: 90, durationUnit: 'minutes', tags: ['corporate'] },
          { title: 'Import EUR Package', price: 1000, currency: 'EUR', duration: 120, durationUnit: 'minutes', tags: ['portrait'] },
        ],
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.imported).toBe(3);
    expect(body.results).toHaveLength(3);

    // Check normalization: first offering should have 250000 cents (2500 * 100)
    const first = body.results[0];
    expect(first.status).toBe('imported');
    expect(first.id).toBeTruthy();

    // Check normalization: third offering (EUR) should have flags if EUR is known
    const third = body.results[2];
    expect(third.status).toBe('imported');

    // Hours should be normalized to minutes: 6 hours → 360 minutes
    const offering1 = await app.inject({
      method: 'GET',
      url: `/api/v1/offerings/${first.id}`,
      headers: { authorization: `Bearer ${merchantToken}` },
    });
    expect(offering1.json().durationMinutes).toBe(360);
    expect(offering1.json().basePriceCents).toBe(250000);
  });

  it('POST /import/offerings detects duplicates within batch', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/import/offerings',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: {
        orgId,
        offerings: [
          { title: 'Duplicate Test A', price: 500, currency: 'USD', duration: 60, durationUnit: 'minutes' },
          { title: 'Duplicate Test A', price: 500, currency: 'USD', duration: 60, durationUnit: 'minutes' },
        ],
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.imported).toBe(2);

    // Second import should detect duplicate with first
    const second = body.results[1];
    expect(second.duplicates.length).toBeGreaterThan(0);
    expect(second.duplicates[0].score).toBeGreaterThanOrEqual(0.85);
  });

  it('POST /import/offerings flags unknown currency', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/import/offerings',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: {
        orgId,
        offerings: [
          { title: 'Unknown Currency Test', price: 100, currency: 'XYZ', duration: 30, durationUnit: 'minutes' },
        ],
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    const result = body.results[0];
    const currencyFlags = result.flags.filter((f: any) => f.issue === 'UNKNOWN_CURRENCY');
    expect(currencyFlags.length).toBeGreaterThan(0);
  });

  it('POST /import/offerings returns 400 for invalid batch', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/import/offerings',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: { orgId, offerings: [] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /import/offerings returns 403 for wrong org', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/import/offerings',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: {
        orgId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        offerings: [{ title: 'Test', price: 100, currency: 'USD', duration: 60, durationUnit: 'minutes' }],
      },
    });
    expect(res.statusCode).toBe(403);
  });

  describe('POST /api/v1/import/cleanse (internal-feed cleansing)', () => {
    it('runs cleansing on existing offerings and returns counts', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/import/cleanse',
        headers: { authorization: `Bearer ${opsToken}` },
        payload: { orgId },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.cleansed).toBeGreaterThanOrEqual(0);
      expect(typeof body.flags).toBe('number');
      expect(typeof body.duplicates).toBe('number');
    });

    it('returns 403 for out-of-scope org', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/import/cleanse',
        headers: { authorization: `Bearer ${opsToken}` },
        payload: { orgId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' },
      });
      expect(res.statusCode).toBe(403);
    });

    it('returns 400 when orgId missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/import/cleanse',
        headers: { authorization: `Bearer ${opsToken}` },
        payload: {},
      });
      expect(res.statusCode).toBe(400);
    });

    it('returns 403 for merchant (no data_quality:review permission)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/import/cleanse',
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: { orgId },
      });
      expect(res.statusCode).toBe(403);
    });
  });
});
