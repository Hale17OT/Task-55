import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { CheckPermissionUseCase, ForbiddenError } from '../../core/use-cases/check-permission';
import type { AuthContext } from '../../core/use-cases/check-permission';
import { DrizzlePermissionRepository } from '../persistence/permission-repository';
import type { Role } from '@studioops/shared';

declare module 'fastify' {
  interface FastifyInstance {
    authorize: (resource: string, action: string) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    authContext?: AuthContext;
  }
}

async function rbacPlugin(fastify: FastifyInstance) {
  const permRepo = new DrizzlePermissionRepository(fastify.db);
  const checkPermission = new CheckPermissionUseCase(permRepo);

  // Helper: ensure authContext is populated (called after JWT is verified)
  async function ensureAuthContext(request: FastifyRequest): Promise<AuthContext> {
    if (request.authContext) return request.authContext;

    // Administrator sees all orgs — orgScope must be undefined (not empty array)
    const role = request.user.role as Role;
    const orgScope = role === 'administrator'
      ? undefined
      : await permRepo.getOrgIdsForUser(request.user.sub);

    request.authContext = {
      userId: request.user.sub,
      role,
      orgScope,
    };
    return request.authContext;
  }

  fastify.decorate('authorize', function (resource: string, action: string) {
    return async function (request: FastifyRequest, reply: FastifyReply) {
      if (!request.user?.sub) {
        return reply.status(401).send({
          error: 'UNAUTHORIZED',
          message: 'Authentication required',
        });
      }

      // Populate authContext (orgScope) after authentication
      const authContext = await ensureAuthContext(request);

      try {
        await checkPermission.execute({
          authContext,
          resource,
          action,
        });
      } catch (err) {
        if (err instanceof ForbiddenError) {
          return reply.status(403).send({
            error: 'FORBIDDEN',
            message: err.message,
          });
        }
        throw err;
      }
    };
  });
}

export default fp(rbacPlugin, {
  name: 'rbac',
  dependencies: ['database', 'auth'],
  fastify: '5.x',
});
