import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import jwt from '@fastify/jwt';
import { eq, and } from 'drizzle-orm';
import { sessions } from '@studioops/db/schema';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    optionalAuthenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; role: string; jti: string };
    user: { sub: string; role: string; jti: string };
  }
}

interface AuthPluginOptions {
  jwtSecret: string;
}

async function authPlugin(fastify: FastifyInstance, opts: AuthPluginOptions) {
  await fastify.register(jwt, {
    secret: opts.jwtSecret,
    sign: {
      expiresIn: '30m',
    },
  });

  fastify.decorate('authenticate', async function (request: FastifyRequest, reply: FastifyReply) {
    // Support token from httpOnly cookie as well as Authorization header
    if (!request.headers.authorization && (request as any).cookies?.accessToken) {
      request.headers.authorization = `Bearer ${(request as any).cookies.accessToken}`;
    }

    try {
      await request.jwtVerify();
    } catch (err) {
      return reply.status(401).send({
        error: 'UNAUTHORIZED',
        message: 'Invalid or expired token',
      });
    }

    // Validate session: look up by jti, reject if revoked or expired
    const jti = request.user.jti;
    if (jti) {
      try {
        const [session] = await fastify.db
          .select()
          .from(sessions)
          .where(eq(sessions.tokenJti, jti))
          .limit(1);

        if (!session) {
          return reply.status(401).send({ error: 'UNAUTHORIZED', message: 'Session not found' });
        }

        if (session.revoked) {
          return reply.status(401).send({ error: 'UNAUTHORIZED', message: 'Session has been revoked' });
        }

        // Sliding session: reject if absoluteExpiresAt has passed (idle too long)
        const now = new Date();
        if (session.absoluteExpiresAt < now) {
          return reply.status(401).send({ error: 'UNAUTHORIZED', message: 'Session expired' });
        }

        // Extend sliding window: set absoluteExpiresAt to now + 8h on each authenticated request
        const slidingExpiry = new Date(now.getTime() + 28_800_000); // 8 hours from now
        await fastify.db
          .update(sessions)
          .set({ lastActivityAt: now, absoluteExpiresAt: slidingExpiry })
          .where(eq(sessions.id, session.id));
      } catch (err) {
        request.log.error({ err }, 'Session validation failed');
        return reply.status(401).send({ error: 'UNAUTHORIZED', message: 'Session validation failed' });
      }
    }
  });

  // Optional authenticate: validates session if token present, but allows guest access (no token = no user, no error)
  fastify.decorate('optionalAuthenticate', async function (request: FastifyRequest, _reply: FastifyReply) {
    // Support token from httpOnly cookie (same as mandatory auth)
    if (!request.headers.authorization && (request as any).cookies?.accessToken) {
      request.headers.authorization = `Bearer ${(request as any).cookies.accessToken}`;
    }

    try {
      await request.jwtVerify();
    } catch {
      // No token or invalid token — guest access, not an error
      return;
    }

    // Token valid — now validate session (same checks as authenticate)
    const jti = request.user?.jti;
    if (jti) {
      try {
        const [session] = await fastify.db
          .select()
          .from(sessions)
          .where(eq(sessions.tokenJti, jti))
          .limit(1);

        const now = new Date();
        if (!session || session.revoked || session.absoluteExpiresAt < now) {
          // Session invalid — treat as unauthenticated guest (clear user)
          (request as any).user = undefined;
          return;
        }

        // Extend sliding window on optional auth too
        const slidingExpiry = new Date(now.getTime() + 28_800_000);
        await fastify.db
          .update(sessions)
          .set({ lastActivityAt: now, absoluteExpiresAt: slidingExpiry })
          .where(eq(sessions.id, session.id));
      } catch {
        // Session check failed — treat as guest
        (request as any).user = undefined;
      }
    }
  });
}

export default fp(authPlugin, {
  name: 'auth',
  dependencies: ['database'],
  fastify: '5.x',
});
