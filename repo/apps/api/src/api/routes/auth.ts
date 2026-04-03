import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { RegisterUseCase, ValidationError, ConflictError } from '../../core/use-cases/register';
import { LoginUseCase, AuthenticationError, LockoutError } from '../../core/use-cases/login';
import { RefreshUseCase } from '../../core/use-cases/refresh';
import { Argon2Hasher } from '../../infrastructure/crypto/argon2-hasher';
import { DrizzleUserRepository } from '../../infrastructure/persistence/user-repository';
import { DrizzleSessionRepository } from '../../infrastructure/persistence/session-repository';
import { DrizzleLockoutRepository } from '../../infrastructure/persistence/lockout-repository';

const registerSchema = z.object({
  username: z.string().min(1, 'Username is required').max(100),
  password: z.string().min(1, 'Password is required'),
});

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export default async function authRoutes(fastify: FastifyInstance) {
  const hasher = new Argon2Hasher();
  const userRepo = new DrizzleUserRepository(fastify.db);
  const sessionRepo = new DrizzleSessionRepository(fastify.db);
  const lockoutRepo = new DrizzleLockoutRepository(fastify.db);

  const registerUseCase = new RegisterUseCase(userRepo, hasher);
  const loginUseCase = new LoginUseCase(userRepo, hasher, sessionRepo, lockoutRepo);
  const refreshUseCase = new RefreshUseCase(sessionRepo, async (userId: string) => {
    const user = await userRepo.findById(userId);
    return user?.role ?? null;
  });

  // POST /auth/register
  fastify.post('/register', async (request, reply) => {
    const parseResult = registerSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: parseResult.error.issues.map((i) => i.message),
      });
    }

    try {
      const result = await registerUseCase.execute(parseResult.data);
      return reply.status(201).send(result);
    } catch (err) {
      if (err instanceof ValidationError) {
        return reply.status(400).send({
          error: 'VALIDATION_ERROR',
          message: err.message,
          details: err.details,
        });
      }
      if (err instanceof ConflictError) {
        return reply.status(409).send({
          error: 'CONFLICT',
          message: err.message,
        });
      }
      throw err;
    }
  });

  // POST /auth/login
  fastify.post('/login', async (request, reply) => {
    const parseResult = loginSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: parseResult.error.issues.map((i) => i.message),
      });
    }

    try {
      const result = await loginUseCase.execute(parseResult.data);
      const accessToken = fastify.jwt.sign(result.accessTokenPayload);

      return reply.status(200).send({
        accessToken,
        refreshToken: result.refreshToken,
        expiresIn: result.expiresIn,
      });
    } catch (err) {
      if (err instanceof LockoutError) {
        reply.header('Retry-After', String(err.retryAfter));
        return reply.status(429).send({
          error: 'ACCOUNT_LOCKED',
          message: err.message,
          retryAfter: err.retryAfter,
        });
      }
      if (err instanceof AuthenticationError) {
        return reply.status(401).send({
          error: 'INVALID_CREDENTIALS',
          message: err.message,
        });
      }
      throw err;
    }
  });

  // POST /auth/refresh
  fastify.post('/refresh', async (request, reply) => {
    const parseResult = refreshSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: parseResult.error.issues.map((i) => i.message),
      });
    }

    try {
      const result = await refreshUseCase.execute(parseResult.data);
      const accessToken = fastify.jwt.sign(result.accessTokenPayload);

      return reply.status(200).send({
        accessToken,
        refreshToken: result.refreshToken,
        expiresIn: result.expiresIn,
      });
    } catch (err) {
      if (err instanceof AuthenticationError) {
        return reply.status(401).send({
          error: 'INVALID_TOKEN',
          message: err.message,
        });
      }
      throw err;
    }
  });

  // POST /auth/logout
  fastify.post('/logout', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const body = request.body as { refreshToken?: string } | undefined;
    const userId = request.user.sub;

    if (body?.refreshToken) {
      const { hashRefreshToken } = await import('../../core/domain/refresh-token');
      const hash = hashRefreshToken(body.refreshToken);
      const token = await sessionRepo.findRefreshTokenByHash(hash);
      if (token) {
        await sessionRepo.markRefreshTokenUsed(token.id);
      }
    } else {
      await sessionRepo.revokeAllRefreshTokensForUser(userId);
    }

    return reply.status(204).send();
  });

  // GET /auth/session
  fastify.get('/session', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = await userRepo.findById(request.user.sub);
    if (!user) {
      return reply.status(401).send({
        error: 'UNAUTHORIZED',
        message: 'User not found',
      });
    }

    // Include the user's primary org (first org membership)
    const { DrizzlePermissionRepository } = await import('../../infrastructure/persistence/permission-repository');
    const permRepo = new DrizzlePermissionRepository(fastify.db);
    const orgIds = await permRepo.getOrgIdsForUser(user.id);

    return reply.status(200).send({
      id: user.id,
      username: user.username,
      role: user.role,
      orgId: orgIds[0] || null,
    });
  });

  // DELETE /auth/sessions/:userId (Admin only)
  fastify.delete('/sessions/:userId', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { userId } = request.params as { userId: string };

    if (request.user.role !== 'administrator') {
      return reply.status(403).send({
        error: 'FORBIDDEN',
        message: 'Insufficient permissions',
      });
    }

    const revokedCount = await sessionRepo.revokeAllRefreshTokensForUser(userId);

    return reply.status(200).send({ revokedCount });
  });
}
