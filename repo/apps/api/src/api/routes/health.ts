import { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import type { HealthResponse } from '@studioops/shared';

export default async function healthRoutes(fastify: FastifyInstance) {
  fastify.get('/health', async (request, reply) => {
    let dbStatus: 'connected' | 'unreachable' = 'unreachable';

    try {
      await fastify.db.execute(sql`SELECT 1`);
      dbStatus = 'connected';
    } catch (err) {
      request.log.error({ err }, 'Health check: database unreachable');
    }

    const response: HealthResponse = {
      status: dbStatus === 'connected' ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      db: dbStatus,
    };

    const statusCode = dbStatus === 'connected' ? 200 : 503;
    return reply.status(statusCode).send(response);
  });
}
