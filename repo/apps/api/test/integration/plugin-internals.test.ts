import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { sql } from 'drizzle-orm';
import FormData from 'form-data';
import { createTestApp } from '../helpers/build-test-app';
import type { FastifyInstance } from 'fastify';

const VALID_PASSWORD = 'ValidPass123!@';

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
 * Plugin internals — directly drives behaviour that the route layer cannot
 * easily reach: cron-style audit retention and quota enforcement under a
 * tight rule. Still exclusively black-box where possible (HTTP for upload),
 * with one direct decorator call for the audit retention purge (no public
 * route exposes it).
 */
describe('Plugin internals — direct decorator + tight quota', () => {
  let app: FastifyInstance;
  let merchantToken: string;
  let merchantId: string;
  let orgId: string;
  let originalUploadLimit: number | null = null;
  let upRule: { id: string; ruleKey: string } | null = null;

  beforeAll(async () => {
    app = await createTestApp();

    const orgs = await app.db.execute(sql`SELECT id FROM organizations LIMIT 1`);
    orgId = (orgs[0] as any).id;

    const ts = Date.now();
    const mName = `pi_merch_${ts}`;
    await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { username: mName, password: VALID_PASSWORD } });
    await app.db.execute(sql`UPDATE users SET role = 'merchant' WHERE username = ${mName}`);
    const mUser = await app.db.execute(sql`SELECT id FROM users WHERE username = ${mName}`);
    merchantId = (mUser[0] as any).id;
    await app.db.execute(sql`INSERT INTO organization_members (org_id, user_id, role_in_org) VALUES (${orgId}, ${merchantId}, 'member') ON CONFLICT DO NOTHING`);
    merchantToken = (await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { username: mName, password: VALID_PASSWORD } })).json().accessToken;

    // Snapshot daily_upload_limit so we can restore it
    const before = await app.db.execute(sql`
      SELECT id, config FROM rules
      WHERE rule_key = 'daily_upload_limit' AND status = 'active'
      ORDER BY version DESC LIMIT 1
    `);
    if (before[0]) {
      upRule = { id: (before[0] as any).id, ruleKey: 'daily_upload_limit' };
      originalUploadLimit = (before[0] as any).config?.limit ?? null;
    }
  });

  afterAll(async () => {
    // Restore original quota limit
    if (upRule && originalUploadLimit !== null) {
      await app.db.execute(sql`
        UPDATE rules
        SET config = jsonb_set(config, '{limit}', to_jsonb(${originalUploadLimit}::int))
        WHERE id = ${upRule.id}
      `);
    }
    if (app) await app.close();
  });

  it('audit-retention: purgeAuditLogs() runs the purge function and updates telemetry', async () => {
    const before = (app as any).auditRetentionTelemetry;
    const beforeRuns = before.totalRuns;

    const purged = await (app as any).purgeAuditLogs();
    expect(typeof purged).toBe('number');
    expect(purged).toBeGreaterThanOrEqual(0);

    const after = (app as any).auditRetentionTelemetry;
    expect(after.totalRuns).toBe(beforeRuns + 1);
    expect(after.totalSuccesses).toBeGreaterThan(0);
    expect(after.lastSuccessAt).not.toBeNull();
    expect(after.lastRunAt).not.toBeNull();
  });

  it('audit-retention: telemetry is exposed as a decorator on the Fastify instance', () => {
    const t = (app as any).auditRetentionTelemetry;
    expect(t).toBeTruthy();
    expect(t).toHaveProperty('totalRuns');
    expect(t).toHaveProperty('totalSuccesses');
    expect(t).toHaveProperty('totalFailures');
    expect(t).toHaveProperty('totalPurged');
  });

  it('enforce-quota: 1-upload limit returns 429 with retryAfter', async () => {
    if (!upRule) {
      // No upload rule in seed — skip
      return;
    }

    // Tighten the upload rule to exactly 1 upload per day. Action count is
    // computed from audit_logs (immutable), so the merchant must be a fresh
    // user with zero prior portfolio.upload audits — which `pi_merch_*` is.
    await app.db.execute(sql`
      UPDATE rules
      SET config = jsonb_set(config, '{limit}', to_jsonb(1::int))
      WHERE id = ${upRule.id}
    `);

    const send = async () => {
      const form = new FormData();
      form.append('file', createTestJpeg(), { filename: `q_${Date.now()}.jpg`, contentType: 'image/jpeg' });
      form.append('title', `quota-test ${Date.now()}`);
      return app.inject({
        method: 'POST',
        url: '/api/v1/portfolio/upload',
        headers: { ...form.getHeaders(), authorization: `Bearer ${merchantToken}` },
        payload: form,
      });
    };

    // First upload: under the (new) limit
    const r1 = await send();
    expect(r1.statusCode).toBe(202);

    // Second upload: should trigger QuotaExceededError → 429
    const r2 = await send();
    expect(r2.statusCode).toBe(429);
    const body = r2.json();
    expect(body.error).toBeDefined();
    expect(typeof body.retryAfter).toBe('number');
  });
});
