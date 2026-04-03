import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { createTestApp } from '../helpers/build-test-app';
import type { FastifyInstance } from 'fastify';

const VALID_PASSWORD = 'ValidPass123!@';

describe('Audit Logging', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('creates audit log entry after authenticated request', async () => {
    const username = `audituser_${Date.now()}`;
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { username, password: VALID_PASSWORD },
    });

    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { username, password: VALID_PASSWORD },
    });

    const { accessToken } = loginRes.json();

    // Make an authenticated request
    await app.inject({
      method: 'GET',
      url: '/api/v1/auth/session',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    // Wait a tick for fire-and-forget audit write
    await new Promise((r) => setTimeout(r, 100));

    // Check audit logs
    const logs = await app.db.execute(
      sql`SELECT * FROM audit_logs WHERE action LIKE '%/auth/session%' ORDER BY created_at DESC LIMIT 1`,
    );
    expect(logs.length).toBeGreaterThan(0);
  });

  it('audit log UPDATE is rejected by trigger', async () => {
    // Insert a log entry first
    await app.db.execute(
      sql`INSERT INTO audit_logs (actor_id, action, resource_type) VALUES (NULL, 'test_action', 'test')`,
    );

    // Try to UPDATE — should fail
    try {
      await app.db.execute(sql`UPDATE audit_logs SET action = 'tampered' WHERE resource_type = 'test'`);
      expect.unreachable('UPDATE should have been rejected by trigger');
    } catch (err: any) {
      expect(err.message).toContain('immutable');
    }
  });

  it('audit log DELETE is rejected by trigger', async () => {
    try {
      await app.db.execute(sql`DELETE FROM audit_logs WHERE resource_type = 'test'`);
      expect.unreachable('DELETE should have been rejected by trigger');
    } catch (err: any) {
      expect(err.message).toContain('immutable');
    }
  });
});

describe('Rate Limiting', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('includes rate limit headers on responses', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/health',
    });

    expect(response.headers['x-ratelimit-limit']).toBeDefined();
    expect(response.headers['x-ratelimit-remaining']).toBeDefined();
  });
});
