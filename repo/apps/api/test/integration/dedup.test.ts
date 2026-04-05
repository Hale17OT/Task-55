import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { createTestApp } from '../helpers/build-test-app';
import type { FastifyInstance } from 'fastify';

const VALID_PASSWORD = 'ValidPass123!@';

describe('Dedup & Data Quality Routes', () => {
  let app: FastifyInstance;
  let opsToken: string;
  let merchantToken: string;
  let orgId: string;
  let offeringAId: string;
  let offeringBId: string;
  let candidateId: string;

  beforeAll(async () => {
    app = await createTestApp();

    const orgs = await app.db.execute(sql`SELECT id FROM organizations LIMIT 1`);
    orgId = (orgs[0] as any).id;

    // Create ops user
    const opsName = `ops_dedup_${Date.now()}`;
    await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { username: opsName, password: VALID_PASSWORD } });
    await app.db.execute(sql`UPDATE users SET role = 'operations' WHERE username = ${opsName}`);
    const opsUser = await app.db.execute(sql`SELECT id FROM users WHERE username = ${opsName}`);
    await app.db.execute(sql`INSERT INTO organization_members (org_id, user_id, role_in_org) VALUES (${orgId}, ${(opsUser[0] as any).id}, 'member')`);
    const opsLogin = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { username: opsName, password: VALID_PASSWORD } });
    opsToken = opsLogin.json().accessToken;

    // Create merchant
    const mName = `m_dedup_${Date.now()}`;
    await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { username: mName, password: VALID_PASSWORD } });
    await app.db.execute(sql`UPDATE users SET role = 'merchant' WHERE username = ${mName}`);
    const mUser = await app.db.execute(sql`SELECT id FROM users WHERE username = ${mName}`);
    await app.db.execute(sql`INSERT INTO organization_members (org_id, user_id, role_in_org) VALUES (${orgId}, ${(mUser[0] as any).id}, 'member')`);
    const mLogin = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { username: mName, password: VALID_PASSWORD } });
    merchantToken = mLogin.json().accessToken;

    // Create two similar offerings
    const resA = await app.inject({
      method: 'POST', url: '/api/v1/offerings',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: { title: 'Wedding Essentials Package', basePriceCents: 250000, durationMinutes: 360, orgId },
    });
    offeringAId = resA.json().id;

    const resB = await app.inject({
      method: 'POST', url: '/api/v1/offerings',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: { title: 'Wedding Essential Package', basePriceCents: 250000, durationMinutes: 360, orgId },
    });
    offeringBId = resB.json().id;

    // Manually create a dedup candidate with a known ID
    candidateId = crypto.randomUUID();
    await app.db.execute(sql`INSERT INTO duplicate_candidates (id, record_type, record_a_id, record_b_id, similarity_score, feature_scores, status) VALUES (${candidateId}, 'offering', ${offeringAId}, ${offeringBId}, '0.9500', '{"title":0.95,"price":1.0,"duration":1.0,"tags":1.0}'::jsonb, 'pending')`);
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  describe('GET /api/v1/dedup/queue', () => {
    it('returns pending candidates for Ops user', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/dedup/queue',
        headers: { authorization: `Bearer ${opsToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.length).toBeGreaterThan(0);
    });

    it('returns 403 for Merchant', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/dedup/queue',
        headers: { authorization: `Bearer ${merchantToken}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('GET /api/v1/dedup/:candidateId', () => {
    it('returns candidate with side-by-side records', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/dedup/${candidateId}`,
        headers: { authorization: `Bearer ${opsToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.candidate).toBeDefined();
      expect(body.recordA).toBeDefined();
      expect(body.recordB).toBeDefined();
    });
  });

  describe('Merge workflow', () => {
    it('POST /dedup/:candidateId/merge merges records', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/dedup/${candidateId}/merge`,
        headers: { authorization: `Bearer ${opsToken}` },
        payload: { survivingRecordId: offeringAId, mergedRecordId: offeringBId },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe('merged');
    });

    it('POST /dedup/:candidateId/merge rejects already resolved', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/dedup/${candidateId}/merge`,
        headers: { authorization: `Bearer ${opsToken}` },
        payload: { survivingRecordId: offeringAId, mergedRecordId: offeringBId },
      });
      expect(res.statusCode).toBe(409);
    });

    it('POST /dedup/:candidateId/merge rejects self-merge', async () => {
      // Create another candidate for self-merge test with random UUID
      const selfMergeId = crypto.randomUUID();
      await app.db.execute(sql`INSERT INTO duplicate_candidates (id, record_type, record_a_id, record_b_id, similarity_score, feature_scores, status) VALUES (${selfMergeId}, 'offering', ${offeringAId}, ${offeringAId}, '1.0000', '{"title":1.0}'::jsonb, 'pending')`);

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/dedup/${selfMergeId}/merge`,
        headers: { authorization: `Bearer ${opsToken}` },
        payload: { survivingRecordId: offeringAId, mergedRecordId: offeringAId },
      });
      expect(res.statusCode).toBe(422);
      expect(res.json().error).toBe('SELF_MERGE_NOT_ALLOWED');
    });

    it('merge creates provenance in merge_history', async () => {
      const history = await app.db.execute(
        sql`SELECT * FROM merge_history WHERE duplicate_candidate_id = ${candidateId}`,
      );
      expect(history.length).toBe(1);
      const prov = (history[0] as any).provenance;
      expect(prov.merge_chain).toBeInstanceOf(Array);
      expect(prov.merge_chain[0].surviving_id).toBe(offeringAId);
      expect(prov.merge_chain[0].merged_id).toBe(offeringBId);
    });
  });

  describe('Org-scope enforcement', () => {
    it('ops user from different org cannot view candidate detail', async () => {
      // Create a second org and an ops user assigned only to it
      await app.db.execute(sql`INSERT INTO organizations (id, name, slug) VALUES ('00000000-0000-4000-a000-000000000077', 'Other Org', 'other-org') ON CONFLICT DO NOTHING`);
      const otherOps = `ops_other_${Date.now()}`;
      await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { username: otherOps, password: VALID_PASSWORD } });
      await app.db.execute(sql`UPDATE users SET role = 'operations' WHERE username = ${otherOps}`);
      const otherOpsUser = await app.db.execute(sql`SELECT id FROM users WHERE username = ${otherOps}`);
      await app.db.execute(sql`INSERT INTO organization_members (org_id, user_id, role_in_org) VALUES ('00000000-0000-4000-a000-000000000077', ${(otherOpsUser[0] as any).id}, 'member')`);
      const otherLogin = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { username: otherOps, password: VALID_PASSWORD } });
      const otherToken = otherLogin.json().accessToken;

      // Create a fresh candidate in the original org
      const freshCandidate = crypto.randomUUID();
      await app.db.execute(sql`INSERT INTO duplicate_candidates (id, record_type, record_a_id, record_b_id, similarity_score, feature_scores, status) VALUES (${freshCandidate}, 'offering', ${offeringAId}, ${offeringBId}, '0.9200', '{"title":0.92}'::jsonb, 'pending')`);

      // Ops user from other org should get 404 for this candidate
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/dedup/${freshCandidate}`,
        headers: { authorization: `Bearer ${otherToken}` },
      });
      expect(res.statusCode).toBe(404);
    });

    it('ops user from different org cannot merge candidate', async () => {
      await app.db.execute(sql`INSERT INTO organizations (id, name, slug) VALUES ('00000000-0000-4000-a000-000000000077', 'Other Org', 'other-org') ON CONFLICT DO NOTHING`);
      const otherOps = `ops_merge_${Date.now()}`;
      await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { username: otherOps, password: VALID_PASSWORD } });
      await app.db.execute(sql`UPDATE users SET role = 'operations' WHERE username = ${otherOps}`);
      const otherOpsUser = await app.db.execute(sql`SELECT id FROM users WHERE username = ${otherOps}`);
      await app.db.execute(sql`INSERT INTO organization_members (org_id, user_id, role_in_org) VALUES ('00000000-0000-4000-a000-000000000077', ${(otherOpsUser[0] as any).id}, 'member')`);
      const otherLogin = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { username: otherOps, password: VALID_PASSWORD } });
      const otherToken = otherLogin.json().accessToken;

      const freshCandidate = crypto.randomUUID();
      await app.db.execute(sql`INSERT INTO duplicate_candidates (id, record_type, record_a_id, record_b_id, similarity_score, feature_scores, status) VALUES (${freshCandidate}, 'offering', ${offeringAId}, ${offeringBId}, '0.9100', '{"title":0.91}'::jsonb, 'pending')`);

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/dedup/${freshCandidate}/merge`,
        headers: { authorization: `Bearer ${otherToken}` },
        payload: { survivingRecordId: offeringAId, mergedRecordId: offeringBId },
      });
      expect(res.statusCode).toBe(404);
    });

    it('ops user from different org cannot dismiss candidate', async () => {
      await app.db.execute(sql`INSERT INTO organizations (id, name, slug) VALUES ('00000000-0000-4000-a000-000000000077', 'Other Org', 'other-org') ON CONFLICT DO NOTHING`);
      const otherOps = `ops_dismiss_${Date.now()}`;
      await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { username: otherOps, password: VALID_PASSWORD } });
      await app.db.execute(sql`UPDATE users SET role = 'operations' WHERE username = ${otherOps}`);
      const otherOpsUser = await app.db.execute(sql`SELECT id FROM users WHERE username = ${otherOps}`);
      await app.db.execute(sql`INSERT INTO organization_members (org_id, user_id, role_in_org) VALUES ('00000000-0000-4000-a000-000000000077', ${(otherOpsUser[0] as any).id}, 'member')`);
      const otherLogin = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { username: otherOps, password: VALID_PASSWORD } });
      const otherToken = otherLogin.json().accessToken;

      const freshCandidate = crypto.randomUUID();
      await app.db.execute(sql`INSERT INTO duplicate_candidates (id, record_type, record_a_id, record_b_id, similarity_score, feature_scores, status) VALUES (${freshCandidate}, 'offering', ${offeringAId}, ${offeringBId}, '0.9000', '{"title":0.90}'::jsonb, 'pending')`);

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/dedup/${freshCandidate}/dismiss`,
        headers: { authorization: `Bearer ${otherToken}` },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('Dismiss workflow', () => {
    let dismissCandidateId: string;

    beforeAll(async () => {
      dismissCandidateId = crypto.randomUUID();
      await app.db.execute(sql`INSERT INTO duplicate_candidates (id, record_type, record_a_id, record_b_id, similarity_score, feature_scores, status) VALUES (${dismissCandidateId}, 'offering', ${offeringAId}, ${offeringBId}, '0.8600', '{"title":0.86}'::jsonb, 'pending')`);
    });

    it('POST /dedup/:candidateId/dismiss dismisses candidate', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/dedup/${dismissCandidateId}/dismiss`,
        headers: { authorization: `Bearer ${opsToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe('dismissed');
    });
  });

  describe('Portfolio-item org-scope enforcement', () => {
    let portfolioItemAId: string;
    let portfolioItemBId: string;
    let portfolioCandidateId: string;
    let portfolioFlagId: string;

    beforeAll(async () => {
      // Get the merchant user id for portfolio items
      const mUser = await app.db.execute(sql`SELECT id FROM users WHERE role = 'merchant' LIMIT 1`);
      const merchantId = (mUser[0] as any).id;

      // Insert two portfolio items in the original org
      const itemARes = await app.db.execute(sql`INSERT INTO portfolio_items (merchant_id, original_org_id, title, media_type, original_path, mime_type, file_size_bytes, status) VALUES (${merchantId}, ${orgId}, 'Sunset Photo', 'photo', 'test/a.jpg', 'image/jpeg', 1024, 'ready') RETURNING id`);
      portfolioItemAId = (itemARes[0] as any).id;

      const itemBRes = await app.db.execute(sql`INSERT INTO portfolio_items (merchant_id, original_org_id, title, media_type, original_path, mime_type, file_size_bytes, status) VALUES (${merchantId}, ${orgId}, 'Sunset Photo', 'photo', 'test/b.jpg', 'image/jpeg', 1024, 'ready') RETURNING id`);
      portfolioItemBId = (itemBRes[0] as any).id;

      // Create a portfolio_item dedup candidate
      portfolioCandidateId = crypto.randomUUID();
      await app.db.execute(sql`INSERT INTO duplicate_candidates (id, record_type, record_a_id, record_b_id, similarity_score, feature_scores, status) VALUES (${portfolioCandidateId}, 'portfolio_item', ${portfolioItemAId}, ${portfolioItemBId}, '0.9500', '{"title":1.0,"mimeType":1.0}'::jsonb, 'pending')`);

      // Create a portfolio_item data quality flag
      const flagRes = await app.db.execute(sql`INSERT INTO data_quality_flags (record_type, record_id, field, issue, status) VALUES ('portfolio_item', ${portfolioItemAId}, 'title', 'MISSING', 'open') RETURNING id`);
      portfolioFlagId = (flagRes[0] as any).id;
    });

    it('in-scope ops user can view portfolio_item candidate', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/dedup/${portfolioCandidateId}`,
        headers: { authorization: `Bearer ${opsToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().candidate.recordType).toBe('portfolio_item');
      expect(res.json().recordA).toBeDefined();
      expect(res.json().recordB).toBeDefined();
    });

    it('out-of-scope ops user cannot view portfolio_item candidate', async () => {
      await app.db.execute(sql`INSERT INTO organizations (id, name, slug) VALUES ('00000000-0000-4000-a000-000000000077', 'Other Org', 'other-org') ON CONFLICT DO NOTHING`);
      const otherOps = `ops_port_view_${Date.now()}`;
      await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { username: otherOps, password: VALID_PASSWORD } });
      await app.db.execute(sql`UPDATE users SET role = 'operations' WHERE username = ${otherOps}`);
      const otherOpsUser = await app.db.execute(sql`SELECT id FROM users WHERE username = ${otherOps}`);
      await app.db.execute(sql`INSERT INTO organization_members (org_id, user_id, role_in_org) VALUES ('00000000-0000-4000-a000-000000000077', ${(otherOpsUser[0] as any).id}, 'member')`);
      const otherLogin = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { username: otherOps, password: VALID_PASSWORD } });
      const otherToken = otherLogin.json().accessToken;

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/dedup/${portfolioCandidateId}`,
        headers: { authorization: `Bearer ${otherToken}` },
      });
      expect(res.statusCode).toBe(404);
    });

    it('out-of-scope ops user cannot dismiss portfolio_item candidate', async () => {
      await app.db.execute(sql`INSERT INTO organizations (id, name, slug) VALUES ('00000000-0000-4000-a000-000000000077', 'Other Org', 'other-org') ON CONFLICT DO NOTHING`);
      const otherOps = `ops_port_dismiss_${Date.now()}`;
      await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { username: otherOps, password: VALID_PASSWORD } });
      await app.db.execute(sql`UPDATE users SET role = 'operations' WHERE username = ${otherOps}`);
      const otherOpsUser = await app.db.execute(sql`SELECT id FROM users WHERE username = ${otherOps}`);
      await app.db.execute(sql`INSERT INTO organization_members (org_id, user_id, role_in_org) VALUES ('00000000-0000-4000-a000-000000000077', ${(otherOpsUser[0] as any).id}, 'member')`);
      const otherLogin = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { username: otherOps, password: VALID_PASSWORD } });
      const otherToken = otherLogin.json().accessToken;

      const freshCandidate = crypto.randomUUID();
      await app.db.execute(sql`INSERT INTO duplicate_candidates (id, record_type, record_a_id, record_b_id, similarity_score, feature_scores, status) VALUES (${freshCandidate}, 'portfolio_item', ${portfolioItemAId}, ${portfolioItemBId}, '0.9400', '{"title":1.0}'::jsonb, 'pending')`);

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/dedup/${freshCandidate}/dismiss`,
        headers: { authorization: `Bearer ${otherToken}` },
      });
      expect(res.statusCode).toBe(404);
    });

    it('out-of-scope ops user cannot see portfolio_item flags', async () => {
      await app.db.execute(sql`INSERT INTO organizations (id, name, slug) VALUES ('00000000-0000-4000-a000-000000000077', 'Other Org', 'other-org') ON CONFLICT DO NOTHING`);
      const otherOps = `ops_port_flag_${Date.now()}`;
      await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { username: otherOps, password: VALID_PASSWORD } });
      await app.db.execute(sql`UPDATE users SET role = 'operations' WHERE username = ${otherOps}`);
      const otherOpsUser = await app.db.execute(sql`SELECT id FROM users WHERE username = ${otherOps}`);
      await app.db.execute(sql`INSERT INTO organization_members (org_id, user_id, role_in_org) VALUES ('00000000-0000-4000-a000-000000000077', ${(otherOpsUser[0] as any).id}, 'member')`);
      const otherLogin = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { username: otherOps, password: VALID_PASSWORD } });
      const otherToken = otherLogin.json().accessToken;

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/dedup/data-quality/flags?status=open',
        headers: { authorization: `Bearer ${otherToken}` },
      });
      expect(res.statusCode).toBe(200);
      // Should not contain any flags from the other org's portfolio items
      const flagIds = res.json().data.map((f: any) => f.id);
      expect(flagIds).not.toContain(portfolioFlagId);
    });

    it('out-of-scope ops user cannot resolve portfolio_item flag', async () => {
      await app.db.execute(sql`INSERT INTO organizations (id, name, slug) VALUES ('00000000-0000-4000-a000-000000000077', 'Other Org', 'other-org') ON CONFLICT DO NOTHING`);
      const otherOps = `ops_port_resolve_${Date.now()}`;
      await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { username: otherOps, password: VALID_PASSWORD } });
      await app.db.execute(sql`UPDATE users SET role = 'operations' WHERE username = ${otherOps}`);
      const otherOpsUser = await app.db.execute(sql`SELECT id FROM users WHERE username = ${otherOps}`);
      await app.db.execute(sql`INSERT INTO organization_members (org_id, user_id, role_in_org) VALUES ('00000000-0000-4000-a000-000000000077', ${(otherOpsUser[0] as any).id}, 'member')`);
      const otherLogin = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { username: otherOps, password: VALID_PASSWORD } });
      const otherToken = otherLogin.json().accessToken;

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/dedup/data-quality/flags/${portfolioFlagId}/resolve`,
        headers: { authorization: `Bearer ${otherToken}` },
      });
      expect(res.statusCode).toBe(404);
    });
  });
});
