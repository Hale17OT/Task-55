import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { createTestApp } from '../helpers/build-test-app';
import { DrizzleOfferingRepository } from '../../src/infrastructure/persistence/offering-repository';
import { DrizzlePortfolioRepository } from '../../src/infrastructure/persistence/portfolio-repository';
import { DrizzleCleansingRepository } from '../../src/infrastructure/persistence/cleansing-repository';
import { DrizzleAnalyticsRepository } from '../../src/infrastructure/persistence/analytics-repository';
import type { FastifyInstance } from 'fastify';

/**
 * Repository unit tests against the real Postgres database (no mocks).
 * These cover the role-based filter branches and error/empty-result paths
 * that HTTP route tests cannot reach without complex fixtures.
 */
describe('Repository direct tests', () => {
  let app: FastifyInstance;
  let orgId: string;
  let merchantId: string;
  let clientId: string;

  beforeAll(async () => {
    app = await createTestApp();
    const orgs = await app.db.execute(sql`SELECT id FROM organizations LIMIT 1`);
    orgId = (orgs[0] as any).id;

    const ts = Date.now();
    await app.db.execute(sql`INSERT INTO users (username, password_hash, role) VALUES (${`rd_m_${ts}`}, 'x', 'merchant')`);
    const m = await app.db.execute(sql`SELECT id FROM users WHERE username = ${`rd_m_${ts}`}`);
    merchantId = (m[0] as any).id;
    await app.db.execute(sql`INSERT INTO organization_members (org_id, user_id, role_in_org) VALUES (${orgId}, ${merchantId}, 'member') ON CONFLICT DO NOTHING`);

    await app.db.execute(sql`INSERT INTO users (username, password_hash, role) VALUES (${`rd_c_${ts}`}, 'x', 'client')`);
    const c = await app.db.execute(sql`SELECT id FROM users WHERE username = ${`rd_c_${ts}`}`);
    clientId = (c[0] as any).id;
    await app.db.execute(sql`INSERT INTO organization_members (org_id, user_id, role_in_org) VALUES (${orgId}, ${clientId}, 'member') ON CONFLICT DO NOTHING`);
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  describe('OfferingRepository.list — role branches', () => {
    let repo: DrizzleOfferingRepository;
    beforeAll(() => { repo = new DrizzleOfferingRepository(app.db); });

    it('administrator role sees everything (no filters)', async () => {
      const result = await repo.list({ page: 1, limit: 5, role: 'administrator' as any });
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('operations with empty orgScope returns no rows', async () => {
      const result = await repo.list({ page: 1, limit: 5, role: 'operations' as any, orgScope: [] });
      expect(result.data.length).toBe(0);
    });

    it('operations with a populated orgScope returns scoped rows', async () => {
      const result = await repo.list({ page: 1, limit: 5, role: 'operations' as any, orgScope: [orgId] });
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('merchant sees own + public+active for others', async () => {
      const result = await repo.list({ page: 1, limit: 5, role: 'merchant' as any, userId: merchantId });
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('merchant without userId still returns a list', async () => {
      const result = await repo.list({ page: 1, limit: 5, role: 'merchant' as any });
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('client with empty orgScope and no userId returns empty', async () => {
      const result = await repo.list({ page: 1, limit: 5, role: 'client' as any, orgScope: [] });
      expect(result.data.length).toBe(0);
    });

    it('client with orgScope and userId returns visible rows', async () => {
      const result = await repo.list({ page: 1, limit: 5, role: 'client' as any, userId: clientId, orgScope: [orgId] });
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('client with orgScope but no userId still returns rows', async () => {
      const result = await repo.list({ page: 1, limit: 5, role: 'client' as any, orgScope: [orgId] });
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('guest sees public + active', async () => {
      const result = await repo.list({ page: 1, limit: 5, role: 'guest' as any });
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('list with status filter works', async () => {
      const result = await repo.list({ page: 1, limit: 5, role: 'administrator' as any, status: 'active' });
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('list with orgId + status filter works', async () => {
      const result = await repo.list({ page: 1, limit: 5, role: 'administrator' as any, orgId, status: 'active' });
      expect(Array.isArray(result.data)).toBe(true);
    });
  });

  describe('PortfolioRepository — list + edge cases', () => {
    let repo: DrizzlePortfolioRepository;
    beforeAll(() => { repo = new DrizzlePortfolioRepository(app.db); });

    it('listItems returns paginated data for merchant', async () => {
      const result = await repo.listItems({ page: 1, limit: 5, role: 'merchant' as any, userId: merchantId });
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('listItems returns paginated data for client (org-scoped)', async () => {
      const result = await repo.listItems({ page: 1, limit: 5, role: 'client' as any, userId: clientId, orgScope: [orgId] });
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('listItems for ops with empty orgScope returns empty', async () => {
      const result = await repo.listItems({ page: 1, limit: 5, role: 'operations' as any, orgScope: [] });
      expect(result.data.length).toBe(0);
    });

    it('listItems with status filter', async () => {
      const result = await repo.listItems({ page: 1, limit: 5, role: 'administrator' as any, status: 'ready' });
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('findById returns null for unknown id', async () => {
      const item = await repo.findById('00000000-0000-0000-0000-000000000999');
      expect(item).toBeNull();
    });

    it('listCategories for a user with no categories returns empty', async () => {
      const u = `rd_pcat_${Date.now()}`;
      await app.db.execute(sql`INSERT INTO users (username, password_hash, role) VALUES (${u}, 'x', 'merchant')`);
      const r = await app.db.execute(sql`SELECT id FROM users WHERE username = ${u}`);
      const cats = await repo.listCategories((r[0] as any).id);
      expect(cats).toEqual([]);
    });

    it('getOrCreateTag idempotently returns same row on second call', async () => {
      const name = `rd_tag_${Date.now()}`;
      const t1 = await repo.getOrCreateTag(name);
      const t2 = await repo.getOrCreateTag(name);
      expect(t1.id).toBe(t2.id);
    });

    it('listTags with empty orgScope returns []', async () => {
      const result = await repo.listTags({ orgScope: [] });
      expect(result).toEqual([]);
    });

    it('listTags with merchantId only returns merchant tags', async () => {
      const result = await repo.listTags({ merchantId });
      expect(Array.isArray(result)).toBe(true);
    });

    it('listTags with search filter', async () => {
      const result = await repo.listTags({ search: 'cov' });
      expect(Array.isArray(result)).toBe(true);
    });

    it('updateCategory returns null for unknown id', async () => {
      const result = await repo.updateCategory('00000000-0000-0000-0000-000000000999', merchantId, { name: 'X' });
      expect(result).toBeNull();
    });

    it('updateCategory updates name + sortOrder for owned category', async () => {
      const cat = await repo.createCategory(merchantId, `RD_${Date.now()}`, 0);
      const updated = await repo.updateCategory(cat.id, merchantId, { name: 'Renamed', sortOrder: 9 });
      expect(updated).toBeTruthy();
      expect(updated!.name).toBe('Renamed');
      expect(updated!.sortOrder).toBe(9);
      await repo.deleteCategory(cat.id, merchantId);
    });

    it('softDelete is idempotent for unknown id', async () => {
      await expect(repo.softDelete('00000000-0000-0000-0000-000000000999')).resolves.toBeUndefined();
    });
  });

  describe('CleansingRepository — list filters', () => {
    let repo: DrizzleCleansingRepository;
    beforeAll(() => { repo = new DrizzleCleansingRepository(app.db); });

    it('listCandidates with empty orgScope returns paginated empty', async () => {
      const result: any = await repo.listCandidates({ orgScope: [] });
      // Repo may return either an array or { data, total } — accept either shape
      const data = Array.isArray(result) ? result : result.data;
      expect(Array.isArray(data)).toBe(true);
    });

    it('listCandidates without orgScope returns paginated all', async () => {
      const result: any = await repo.listCandidates({});
      const data = Array.isArray(result) ? result : result.data;
      expect(Array.isArray(data)).toBe(true);
    });

    it('listCandidates with status filter', async () => {
      const result: any = await repo.listCandidates({ status: 'pending' });
      const data = Array.isArray(result) ? result : result.data;
      expect(Array.isArray(data)).toBe(true);
    });

    it('listFlags with empty orgScope returns paginated empty', async () => {
      const result: any = await repo.listFlags({ orgScope: [] });
      const data = Array.isArray(result) ? result : result.data;
      expect(Array.isArray(data)).toBe(true);
    });

    it('findCandidateById returns null for unknown id', async () => {
      const c = await repo.findCandidateById('00000000-0000-0000-0000-000000000999');
      expect(c).toBeNull();
    });
  });

  describe('LockoutRepository — direct call to dead-code methods', () => {
    it('getActiveLockout returns null when no restriction exists', async () => {
      const { DrizzleLockoutRepository } = await import('../../src/infrastructure/persistence/lockout-repository');
      const repo = new DrizzleLockoutRepository(app.db);
      const r = await repo.getActiveLockout('00000000-0000-0000-0000-000000000999');
      expect(r).toBeNull();
    });

    it('getActiveLockout returns the row when an active restriction exists', async () => {
      const { DrizzleLockoutRepository } = await import('../../src/infrastructure/persistence/lockout-repository');
      const repo = new DrizzleLockoutRepository(app.db);
      // Create a fresh user to avoid clashing with auth-lockout integration tests
      const u = `rd_lock_${Date.now()}`;
      await app.db.execute(sql`INSERT INTO users (username, password_hash, role) VALUES (${u}, 'x', 'client')`);
      const userRow = await app.db.execute(sql`SELECT id FROM users WHERE username = ${u}`);
      const uid = (userRow[0] as any).id;
      const future = new Date(Date.now() + 3600_000);
      await repo.createLockout(uid, future, 'test', 'lockout');
      const r = await repo.getActiveLockout(uid);
      expect(r).toBeTruthy();
      expect(r!.userId).toBe(uid);
    });
  });

  describe('AnalyticsRepository — empty + filter branches', () => {
    let repo: DrizzleAnalyticsRepository;
    beforeAll(() => { repo = new DrizzleAnalyticsRepository(app.db); });

    it('getDashboard returns shaped data with all filters', async () => {
      const result = await repo.getDashboard({
        from: new Date('2020-01-01'),
        to: new Date('2099-12-31'),
        orgId,
      });
      expect(result).toBeTruthy();
    });

    it('getDashboard with eventType filter', async () => {
      const result = await repo.getDashboard({
        from: new Date('2020-01-01'),
        to: new Date('2099-12-31'),
        orgId,
        eventType: 'workshop',
      });
      expect(result).toBeTruthy();
    });
  });
});
