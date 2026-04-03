import { FastifyInstance, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import rateLimit from '@fastify/rate-limit';
import { RATE_LIMITS } from '@studioops/shared';

const multiplier = parseInt(process.env.RATE_LIMIT_MULTIPLIER || '0', 10);
const LIMIT_MULTIPLIER = multiplier > 0 ? multiplier : (process.env.NODE_ENV === 'test' ? 100 : 1);

/**
 * Verified JWT identity extraction for rate-limit keying.
 * Uses Fastify's JWT verifier (cryptographic signature check).
 * Returns null on any failure — caller treats as guest.
 * Result is cached on the request to avoid repeated verification.
 */
async function getVerifiedIdentity(request: FastifyRequest): Promise<{ sub: string; role: string } | null> {
  // If auth middleware already ran, trust its result
  if (request.user?.sub) return request.user as { sub: string; role: string };

  // Check cache from a previous rate-limit call on this request
  if ((request as any)._rateLimitIdentity !== undefined) return (request as any)._rateLimitIdentity;

  const auth = request.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    (request as any)._rateLimitIdentity = null;
    return null;
  }

  try {
    // Full cryptographic verification via Fastify JWT plugin
    const decoded = request.server.jwt.verify<{ sub: string; role: string }>(auth.slice(7));
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
