import { describe, it, expect, afterAll } from 'vitest';
import { createTestApp } from '../helpers/build-test-app.js';
import type { FastifyInstance } from 'fastify';

describe('GET /api/v1/health', () => {
  let app: FastifyInstance;

  afterAll(async () => {
    if (app) await app.close();
  });

  it('returns 200 with status ok when DB is reachable', async () => {
    app = await createTestApp();

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/health',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe('ok');
    expect(body.db).toBe('connected');
    expect(body.timestamp).toBeDefined();
  });

  it('returns valid ISO timestamp', async () => {
    if (!app) app = await createTestApp();

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/health',
    });

    const body = response.json();
    const parsed = new Date(body.timestamp);
    expect(parsed.toISOString()).toBe(body.timestamp);
  });
});

describe('Error handler', () => {
  let app: FastifyInstance;

  afterAll(async () => {
    if (app) await app.close();
  });

  it('returns 404 for unknown routes with proper error shape', async () => {
    app = await createTestApp();

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/nonexistent',
    });

    expect(response.statusCode).toBe(404);
    const body = response.json();
    expect(body.error).toBe('NOT_FOUND');
    expect(body.message).toBe('Route not found');
  });
});
