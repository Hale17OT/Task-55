import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { createTestApp } from '../helpers/build-test-app';
import type { FastifyInstance } from 'fastify';

const VALID_PASSWORD = 'ValidPass123!@';

describe('RBAC & Authorization', () => {
  let app: FastifyInstance;
  let merchantToken: string;
  let clientToken: string;

  beforeAll(async () => {
    app = await createTestApp();

    // Register and login a merchant (we'll need to manually set role via DB for testing)
    const merchantName = `merchant_rbac_${Date.now()}`;
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { username: merchantName, password: VALID_PASSWORD },
    });

    // Update role to merchant directly (since register defaults to client)
    await app.db.execute(sql`UPDATE users SET role = 'merchant' WHERE username = ${merchantName}`);

    const merchantLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { username: merchantName, password: VALID_PASSWORD },
    });
    merchantToken = merchantLogin.json().accessToken;

    // Register and login a client
    const clientName = `client_rbac_${Date.now()}`;
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { username: clientName, password: VALID_PASSWORD },
    });
    const clientLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { username: clientName, password: VALID_PASSWORD },
    });
    clientToken = clientLogin.json().accessToken;
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  describe('authorize decorator', () => {
    it('returns 401 when no token provided on protected route', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/session',
      });
      expect(response.statusCode).toBe(401);
    });

    it('allows authenticated user to access session endpoint', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/session',
        headers: { authorization: `Bearer ${clientToken}` },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().role).toBe('client');
    });

    it('returns 403 when non-admin tries to revoke sessions', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/v1/auth/sessions/some-user-id',
        headers: { authorization: `Bearer ${clientToken}` },
      });
      expect(response.statusCode).toBe(403);
    });
  });

  describe('Permission seed', () => {
    it('seed script is idempotent (running twice does not error)', async () => {
      // Import and run seed
      const { seed } = await import('../../../../packages/db/src/seed');
      const dbUrl = process.env.DATABASE_URL || 'postgres://studioops:dev_password_change_me@127.0.0.1:54320/studioops';

      // Run twice
      await seed(dbUrl);
      await seed(dbUrl);
      // If we get here without error, it's idempotent
    });
  });
});
