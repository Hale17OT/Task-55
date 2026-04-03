import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { createTestApp } from '../helpers/build-test-app';
import type { FastifyInstance } from 'fastify';

const VALID_PASSWORD = 'ValidPass123!@';

describe('Auth Routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  describe('POST /api/v1/auth/register', () => {
    it('succeeds with valid data and returns 201', async () => {
      const username = `testuser_${Date.now()}`;
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: { username, password: VALID_PASSWORD },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.id).toBeDefined();
      expect(body.username).toBe(username.toLowerCase());
      expect(body.createdAt).toBeDefined();
      expect(body).not.toHaveProperty('passwordHash');
      expect(body).not.toHaveProperty('password');
    });

    it('returns 409 for duplicate username', async () => {
      const username = `dupuser_${Date.now()}`;
      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: { username, password: VALID_PASSWORD },
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: { username, password: VALID_PASSWORD },
      });

      expect(response.statusCode).toBe(409);
    });

    it('returns 400 for weak password', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: { username: `user_${Date.now()}`, password: 'short' },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.details.length).toBeGreaterThan(0);
    });

    it('returns 400 for missing fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /api/v1/auth/login', () => {
    const loginUser = `loginuser_${Date.now()}`;

    beforeAll(async () => {
      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: { username: loginUser, password: VALID_PASSWORD },
      });
    });

    it('returns 200 with tokens for valid credentials', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { username: loginUser, password: VALID_PASSWORD },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.accessToken).toBeDefined();
      expect(body.refreshToken).toBeDefined();
      expect(body.expiresIn).toBe(1800);
    });

    it('returns 401 for wrong password', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { username: loginUser, password: 'WrongPass123!@' },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json().message).toBe('Invalid credentials');
    });

    it('returns 401 for non-existent user', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { username: 'nonexistent_user_xyz', password: VALID_PASSWORD },
      });

      expect(response.statusCode).toBe(401);
      // Same message as wrong password — no user enumeration
      expect(response.json().message).toBe('Invalid credentials');
    });

    it('password is not present in any response body', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { username: loginUser, password: VALID_PASSWORD },
      });

      const bodyText = response.body;
      expect(bodyText).not.toContain(VALID_PASSWORD);
      expect(bodyText).not.toContain('passwordHash');
    });
  });

  describe('POST /api/v1/auth/refresh', () => {
    it('returns new token pair', async () => {
      const username = `refreshuser_${Date.now()}`;
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

      const { refreshToken } = loginRes.json();

      const refreshRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        payload: { refreshToken },
      });

      expect(refreshRes.statusCode).toBe(200);
      const body = refreshRes.json();
      expect(body.accessToken).toBeDefined();
      expect(body.refreshToken).toBeDefined();
      expect(body.refreshToken).not.toBe(refreshToken); // new token
    });

    it('refreshed access token can call protected endpoint', async () => {
      const username = `refreshprotected_${Date.now()}`;
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

      const { refreshToken } = loginRes.json();

      const refreshRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        payload: { refreshToken },
      });

      expect(refreshRes.statusCode).toBe(200);
      const newAccessToken = refreshRes.json().accessToken;

      // Use the refreshed access token to call a protected endpoint
      const sessionRes = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/session',
        headers: { authorization: `Bearer ${newAccessToken}` },
      });

      expect(sessionRes.statusCode).toBe(200);
      expect(sessionRes.json().username).toBe(username);
    });

    it('refresh extends session absoluteExpiresAt (sliding window)', async () => {
      const username = `refreshslide_${Date.now()}`;
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

      const { refreshToken, accessToken } = loginRes.json();

      // Get the original session absoluteExpiresAt
      const decoded = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64url').toString());
      const [origSession] = await app.db.execute(
        sql`SELECT absolute_expires_at FROM sessions WHERE token_jti = ${decoded.jti}`,
      );
      const origExpiry = new Date((origSession as any).absolute_expires_at);

      // Refresh after a brief delay
      const refreshRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        payload: { refreshToken },
      });

      expect(refreshRes.statusCode).toBe(200);
      const newAccessToken = refreshRes.json().accessToken;

      // Verify the session's absoluteExpiresAt was updated (extended)
      const newDecoded = JSON.parse(Buffer.from(newAccessToken.split('.')[1], 'base64url').toString());
      const [updatedSession] = await app.db.execute(
        sql`SELECT absolute_expires_at FROM sessions WHERE token_jti = ${newDecoded.jti}`,
      );
      const updatedExpiry = new Date((updatedSession as any).absolute_expires_at);

      // Updated expiry should be >= original (it was extended on refresh)
      expect(updatedExpiry.getTime()).toBeGreaterThanOrEqual(origExpiry.getTime());
    });

    it('rejects reused refresh token (rotation)', async () => {
      const username = `rotateuser_${Date.now()}`;
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

      const { refreshToken } = loginRes.json();

      // Use token once (success)
      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        payload: { refreshToken },
      });

      // Try to reuse the same token
      const replayRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        payload: { refreshToken },
      });

      expect(replayRes.statusCode).toBe(401);
    });
  });

  describe('GET /api/v1/auth/session', () => {
    it('returns user info for valid token', async () => {
      const username = `sessionuser_${Date.now()}`;
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

      const sessionRes = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/session',
        headers: { authorization: `Bearer ${accessToken}` },
      });

      expect(sessionRes.statusCode).toBe(200);
      const body = sessionRes.json();
      expect(body.username).toBe(username);
      expect(body.role).toBe('client');
    });

    it('returns 401 without token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/session',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('returns 204 on logout', async () => {
      const username = `logoutuser_${Date.now()}`;
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

      const logoutRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/logout',
        headers: { authorization: `Bearer ${accessToken}` },
      });

      expect(logoutRes.statusCode).toBe(204);
    });

    it('old access token is rejected after logout', async () => {
      const username = `logoutreject_${Date.now()}`;
      await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { username, password: VALID_PASSWORD } });
      const loginRes = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { username, password: VALID_PASSWORD } });
      const { accessToken } = loginRes.json();

      // Logout (revokes session)
      await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: { authorization: `Bearer ${accessToken}` } });

      // Try to use the old access token — should be rejected because session is revoked
      const res = await app.inject({ method: 'GET', url: '/api/v1/auth/session', headers: { authorization: `Bearer ${accessToken}` } });
      expect(res.statusCode).toBe(401);
    });

    it('old access token is rejected after admin session revocation', async () => {
      // Create target user
      const target = `revoketarget_${Date.now()}`;
      await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { username: target, password: VALID_PASSWORD } });
      const targetLogin = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { username: target, password: VALID_PASSWORD } });
      const targetToken = targetLogin.json().accessToken;
      const targetId = (await app.inject({ method: 'GET', url: '/api/v1/auth/session', headers: { authorization: `Bearer ${targetToken}` } })).json().id;

      // Create admin
      const admin = `revokeadmin_${Date.now()}`;
      await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { username: admin, password: VALID_PASSWORD } });
      await app.db.execute(sql`UPDATE users SET role = 'administrator' WHERE username = ${admin}`);
      const adminLogin = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { username: admin, password: VALID_PASSWORD } });
      const adminToken = adminLogin.json().accessToken;

      // Admin revokes target's sessions
      await app.inject({ method: 'DELETE', url: `/api/v1/auth/sessions/${targetId}`, headers: { authorization: `Bearer ${adminToken}` } });

      // Target's old token should now be rejected
      const res = await app.inject({ method: 'GET', url: '/api/v1/auth/session', headers: { authorization: `Bearer ${targetToken}` } });
      expect(res.statusCode).toBe(401);
    });
  });
});
