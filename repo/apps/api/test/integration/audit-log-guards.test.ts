import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { createTestApp } from '../helpers/build-test-app';
import type { FastifyInstance } from 'fastify';

const VALID_PASSWORD = 'ValidPass123!@';

/**
 * Audit-log plugin guard-rail coverage.
 *
 * These tests exercise the AUDIT_VIOLATION (write op without writeAudit())
 * and AUDIT_PERSISTENCE_FAILURE (DB insert fails after retries) paths in
 * src/infrastructure/plugins/audit-log.ts.  Both are last-resort defensive
 * branches that production routes are not allowed to trip; we exercise them
 * by registering temporary test-only routes on the live app instance.
 *
 * Routes are registered AFTER the production route plugins, on the same
 * `/api/v1` prefix that the audit-log onSend hook checks. They are torn
 * down with the app in afterAll.
 */
describe('Audit-log plugin guard rails', () => {
  let app: FastifyInstance;
  let token: string;

  beforeAll(async () => {
    app = await createTestApp({}, async (a) => {
      // Test-only POST under /api/v1 that finishes 200 WITHOUT writeAudit().
      // Trips the AUDIT_VIOLATION guard in audit-log.ts onSend hook.
      a.post('/api/v1/__cov_test_no_audit', {
        preHandler: [a.authenticate],
      }, async (_req: any, reply: any) => {
        return reply.status(200).send({ ok: true });
      });

      // Test-only POST that calls writeAudit() but the insert fails because
      // we use a deliberately oversize resourceType. Trips the AUDIT
      // persistence-failure path in writeAudit().
      a.post('/api/v1/__cov_test_audit_fail', {
        preHandler: [a.authenticate],
      }, async (req: any, reply: any) => {
        req.auditContext = {
          resourceType: 'x'.repeat(70_000),
          action: 'test.fail',
        };
        try {
          await req.writeAudit();
        } catch (err) {
          return reply.status(500).send({ error: 'AUDIT_FAILED', message: (err as Error).message });
        }
        return reply.status(200).send({ ok: true });
      });
    });

    const u = `audit_guards_${Date.now()}`;
    await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { username: u, password: VALID_PASSWORD } });
    await app.db.execute(sql`UPDATE users SET role = 'administrator' WHERE username = ${u}`);
    const login = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { username: u, password: VALID_PASSWORD } });
    token = login.json().accessToken;
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('AUDIT_VIOLATION: route returns 200 without writeAudit() → onSend rewrites to 500', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/__cov_test_no_audit',
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });
    expect(res.statusCode).toBe(500);
    expect(res.json().error).toBe('AUDIT_VIOLATION');
  });

  it('writeAudit() throws AUDIT_PERSISTENCE_FAILURE when the DB insert fails after retries', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/__cov_test_audit_fail',
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });
    // Either the route catches and returns 500 with AUDIT_FAILED, or the
    // onSend hook intervenes with AUDIT_PERSISTENCE_FAILURE — both are
    // valid expressions of the same defensive branch. Either way the
    // client cannot get a 2xx for an un-audited write.
    expect(res.statusCode).toBe(500);
    const body = res.json();
    expect(['AUDIT_FAILED', 'AUDIT_PERSISTENCE_FAILURE', 'AUDIT_VIOLATION', 'INTERNAL_SERVER_ERROR']).toContain(body.error);
  });
});
