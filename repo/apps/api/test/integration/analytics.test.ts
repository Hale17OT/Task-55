import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { createTestApp } from '../helpers/build-test-app';
import type { FastifyInstance } from 'fastify';

const VALID_PASSWORD = 'ValidPass123!@';

describe('Analytics Routes', () => {
  let app: FastifyInstance;
  let opsToken: string;
  let merchantToken: string;
  let orgId: string;

  beforeAll(async () => {
    app = await createTestApp();

    const orgs = await app.db.execute(sql`SELECT id FROM organizations LIMIT 1`);
    orgId = (orgs[0] as any).id;

    // Create ops user
    const opsName = `ops_analytics_${Date.now()}`;
    await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { username: opsName, password: VALID_PASSWORD } });
    await app.db.execute(sql`UPDATE users SET role = 'operations' WHERE username = ${opsName}`);
    const opsUser = await app.db.execute(sql`SELECT id FROM users WHERE username = ${opsName}`);
    await app.db.execute(sql`INSERT INTO organization_members (org_id, user_id, role_in_org) VALUES (${orgId}, ${(opsUser[0] as any).id}, 'member')`);
    const opsLogin = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { username: opsName, password: VALID_PASSWORD } });
    opsToken = opsLogin.json().accessToken;

    // Create merchant for 403 test
    const mName = `m_analytics_${Date.now()}`;
    await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { username: mName, password: VALID_PASSWORD } });
    const mLogin = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { username: mName, password: VALID_PASSWORD } });
    merchantToken = mLogin.json().accessToken;

    // Seed some events for metrics
    const merchantForEvents = `m_ev_analytics_${Date.now()}`;
    await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { username: merchantForEvents, password: VALID_PASSWORD } });
    await app.db.execute(sql`UPDATE users SET role = 'merchant' WHERE username = ${merchantForEvents}`);
    const mEvUser = await app.db.execute(sql`SELECT id FROM users WHERE username = ${merchantForEvents}`);
    const mEvId = (mEvUser[0] as any).id;
    await app.db.execute(sql`INSERT INTO organization_members (org_id, user_id, role_in_org) VALUES (${orgId}, ${mEvId}, 'member')`);

    // Insert events directly
    await app.db.execute(sql`INSERT INTO events (org_id, merchant_id, title, event_type, scheduled_at, duration_minutes, channel, tags) VALUES
      (${orgId}, ${mEvId}, 'Wedding Session 1', 'wedding', '2026-03-15T10:00:00Z', 480, 'referral', ARRAY['wedding','outdoor']),
      (${orgId}, ${mEvId}, 'Corporate Headshot 1', 'corporate', '2026-03-16T09:00:00Z', 90, 'website', ARRAY['corporate','studio']),
      (${orgId}, ${mEvId}, 'Wedding Session 2', 'wedding', '2026-03-20T10:00:00Z', 360, 'walk-in', ARRAY['wedding','indoor'])`);
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  describe('GET /api/v1/analytics/dashboard', () => {
    it('returns dashboard with all metric blocks', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/analytics/dashboard?from=2026-01-01&to=2026-12-31',
        headers: { authorization: `Bearer ${opsToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.generatedAt).toBeDefined();
      expect(body.popularity).toBeDefined();
      expect(body.popularity.labels).toBeInstanceOf(Array);
      expect(body.conversionFunnel).toBeDefined();
      expect(body.attendanceRate).toBeDefined();
      expect(body.cancellationRate).toBeDefined();
      expect(body.channelDistribution).toBeDefined();
      expect(body.tagDistribution).toBeDefined();
    });

    it('returns populated popularity data', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/analytics/dashboard?from=2026-01-01&to=2026-12-31',
        headers: { authorization: `Bearer ${opsToken}` },
      });

      const body = res.json();
      expect(body.popularity.labels.length).toBeGreaterThan(0);
      expect(body.popularity.labels).toContain('wedding');
    });

    it('returns 403 for Merchant', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/analytics/dashboard',
        headers: { authorization: `Bearer ${merchantToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it('returns 422 for invalid date range', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/analytics/dashboard?from=2026-12-31&to=2026-01-01',
        headers: { authorization: `Bearer ${opsToken}` },
      });
      expect(res.statusCode).toBe(422);
    });
  });

  describe('POST /api/v1/analytics/export', () => {
    it('exports CSV with correct content-type', async () => {
      // Use a fresh ops user to avoid cooldown interference from other tests
      const freshOps = `ops_csv_${Date.now()}`;
      await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { username: freshOps, password: 'ValidPass123!@' } });
      await app.db.execute(sql`UPDATE users SET role = 'operations' WHERE username = ${freshOps}`);
      const freshOpsUser = await app.db.execute(sql`SELECT id FROM users WHERE username = ${freshOps}`);
      await app.db.execute(sql`INSERT INTO organization_members (org_id, user_id, role_in_org) VALUES (${orgId}, ${(freshOpsUser[0] as any).id}, 'member')`);
      const freshLogin = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { username: freshOps, password: 'ValidPass123!@' } });
      const freshToken = freshLogin.json().accessToken;

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/analytics/export',
        headers: { authorization: `Bearer ${freshToken}` },
        payload: { format: 'csv', filters: { from: '2026-01-01', to: '2026-12-31' } },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain('analytics-');
      expect(res.body).toContain('Popularity');
    });

    it('exports XLSX with correct content-type', async () => {
      // Use fresh user to avoid cooldown
      const freshName = `ops_xlsx_${Date.now()}`;
      await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { username: freshName, password: 'ValidPass123!@' } });
      await app.db.execute(sql`UPDATE users SET role = 'operations' WHERE username = ${freshName}`);
      const freshUser = await app.db.execute(sql`SELECT id FROM users WHERE username = ${freshName}`);
      await app.db.execute(sql`INSERT INTO organization_members (org_id, user_id, role_in_org) VALUES (${orgId}, ${(freshUser[0] as any).id}, 'member')`);
      const freshLogin = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { username: freshName, password: 'ValidPass123!@' } });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/analytics/export',
        headers: { authorization: `Bearer ${freshLogin.json().accessToken}` },
        payload: { format: 'xlsx', filters: { from: '2026-01-01', to: '2026-12-31' } },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('spreadsheetml');
    });

    it('returns 403 for operations user exporting out-of-scope org', async () => {
      // Create ops user in one org, try to export data from a different org
      const freshOps = `ops_scope_${Date.now()}`;
      await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { username: freshOps, password: 'ValidPass123!@' } });
      await app.db.execute(sql`UPDATE users SET role = 'operations' WHERE username = ${freshOps}`);
      const freshOpsUser = await app.db.execute(sql`SELECT id FROM users WHERE username = ${freshOps}`);
      await app.db.execute(sql`INSERT INTO organization_members (org_id, user_id, role_in_org) VALUES (${orgId}, ${(freshOpsUser[0] as any).id}, 'member')`);
      const freshLogin = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { username: freshOps, password: 'ValidPass123!@' } });
      const freshToken = freshLogin.json().accessToken;

      // Use a random UUID as an out-of-scope orgId
      const outOfScopeOrgId = '00000000-0000-4000-a000-000000000099';

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/analytics/export',
        headers: { authorization: `Bearer ${freshToken}` },
        payload: { format: 'csv', filters: { from: '2026-01-01', to: '2026-12-31', orgId: outOfScopeOrgId } },
      });

      expect(res.statusCode).toBe(403);
      expect(res.json().error).toBe('FORBIDDEN_ORG_ACCESS');
    });

    it('returns 422 for invalid format', async () => {
      // Use fresh user to avoid cooldown
      const freshName = `ops_fmt_${Date.now()}`;
      await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { username: freshName, password: 'ValidPass123!@' } });
      await app.db.execute(sql`UPDATE users SET role = 'operations' WHERE username = ${freshName}`);
      const freshUser = await app.db.execute(sql`SELECT id FROM users WHERE username = ${freshName}`);
      await app.db.execute(sql`INSERT INTO organization_members (org_id, user_id, role_in_org) VALUES (${orgId}, ${(freshUser[0] as any).id}, 'member')`);
      const freshLogin = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { username: freshName, password: 'ValidPass123!@' } });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/analytics/export',
        headers: { authorization: `Bearer ${freshLogin.json().accessToken}` },
        payload: { format: 'pdf' },
      });
      expect(res.statusCode).toBe(422);
    });
  });
});
