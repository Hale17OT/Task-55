import { FastifyInstance, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import rateLimit from '@fastify/rate-limit';
import { RATE_LIMITS } from '@studioops/shared';

const multiplier = parseInt(process.env.RATE_LIMIT_MULTIPLIER || '0', 10);
const LIMIT_MULTIPLIER = multiplier > 0 ? multiplier : (process.env.NODE_ENV === 'test' ? 100 : 1);

/**
 * JWT identity extraction for rate-limit keying.
 * Checks request.user first (set by auth middleware on protected routes).
 * Falls back to cryptographic JWT signature verification for public routes
 * where auth middleware hasn't run yet.
 * Revoked-but-unexpired tokens may get authenticated buckets here —
 * this is acceptable because the route's auth preHandler will reject them.
 */
function getVerifiedIdentity(request: FastifyRequest): { sub: string; role: string } | null {
  // If auth middleware already ran, trust its result (includes session validation)
  if (request.user?.sub) return request.user as { sub: string; role: string };

  // Check cache
  if ((request as any)._rateLimitIdentity !== undefined) return (request as any)._rateLimitIdentity;

  // Try cookie fallback
  let token: string | undefined;
  const auth = request.headers.authorization;
  if (auth?.startsWith('Bearer ')) {
    token = auth.slice(7);
  } else if ((request as any).cookies?.accessToken) {
    token = (request as any).cookies.accessToken;
  }

  if (!token) {
    (request as any)._rateLimitIdentity = null;
    return null;
  }

  try {
    const decoded = request.server.jwt.verify<{ sub: string; role: string }>(token);
    (request as any)._rateLimitIdentity = decoded;
    return decoded;
  } catch {
    (request as any)._rateLimitIdentity = null;
    return null;
  }
}

async function rateLimitPlugin(fastify: FastifyInstance) {
  await fastify.register(rateLimit, {
    max: async (request) => {
      const identity = await getVerifiedIdentity(request);
      if (identity?.sub) return RATE_LIMITS.AUTHENTICATED * LIMIT_MULTIPLIER;
      return RATE_LIMITS.GUEST * LIMIT_MULTIPLIER;
    },
    timeWindow: RATE_LIMITS.WINDOW_MS,
    keyGenerator: async (request) => {
      const identity = await getVerifiedIdentity(request);
      if (identity?.sub) return `user:${identity.sub}`;
      return `guest:${request.ip}`;
    },
    errorResponseBuilder: (_request, context) => {
      return {
        error: 'TOO_MANY_REQUESTS',
        message: 'Rate limit exceeded',
        retryAfter: Math.ceil(context.ttl / 1000),
      };
    },
  });
}

export default fp(rateLimitPlugin, {
  name: 'rate-limit',
  dependencies: ['auth'],
  fastify: '5.x',
});
