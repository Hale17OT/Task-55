import { FastifyInstance } from 'fastify';
import {
  createOfferingSchema,
  updateOfferingSchema,
  changeOfferingStatusSchema,
  createAddonSchema,
  grantAccessSchema,
} from '@studioops/shared';
import { validateStatusTransition, isArchived } from '../../core/domain/offering';
import { DrizzleOfferingRepository } from '../../infrastructure/persistence/offering-repository';
import { DrizzleCleansingRepository } from '../../infrastructure/persistence/cleansing-repository';
import { autoCleanseRecord } from '../../core/use-cases/auto-cleanse';
import type { Role } from '@studioops/shared';

export default async function offeringRoutes(fastify: FastifyInstance) {
  const offeringRepo = new DrizzleOfferingRepository(fastify.db);
  const cleansingRepo = new DrizzleCleansingRepository(fastify.db);

  // POST /offerings
  fastify.post('/', {
    preHandler: [fastify.authenticate, fastify.authorize('offering', 'create')],
  }, async (request, reply) => {
    const parseResult = createOfferingSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: parseResult.error.issues.map((i) => i.message),
      });
    }

    const { orgId, ...rest } = parseResult.data;

    // Verify merchant is in org
    if (request.authContext?.orgScope && !request.authContext.orgScope.includes(orgId)) {
      return reply.status(403).send({
        error: 'FORBIDDEN',
        message: 'You are not a member of this organization',
      });
    }

    const offering = await offeringRepo.create({
      ...rest,
      orgId,
      merchantId: request.user.sub,
    });

    request.auditContext = {
      resourceType: 'offering',
      resourceId: offering.id,
      afterState: offering,
    };
    await request.writeAudit();

    // Auto-cleansing: normalize, detect outliers, find duplicates (fire-and-forget)
    (async () => {
      try {
        const allOfferings = await offeringRepo.list({ page: 1, limit: 200, orgId, role: 'administrator' as Role, status: 'active' });
        const targets = allOfferings.data.map(o => ({
          id: o.id, title: o.title, priceCents: o.basePriceCents,
          durationMinutes: o.durationMinutes, tags: o.tags ?? [], orgId: o.orgId,
        }));
        const medianPrice = targets.length > 0
          ? targets.map(t => t.priceCents).sort((a, b) => a - b)[Math.floor(targets.length / 2)]
          : 0;

        const result = autoCleanseRecord(
          { id: offering.id, title: offering.title, priceCents: offering.basePriceCents, durationMinutes: offering.durationMinutes, tags: offering.tags ?? [], orgId },
          targets, medianPrice,
        );

        for (const flag of result.flags) {
          await cleansingRepo.createFlag({ recordType: 'offering', recordId: offering.id, field: flag.field, issue: flag.issue, detail: flag.detail });
        }
        for (const dup of result.duplicateCandidates) {
          await cleansingRepo.createCandidate({ recordType: 'offering', recordAId: offering.id, recordBId: dup.existingId, similarityScore: dup.score, featureScores: dup.featureScores });
        }
      } catch (err) {
        fastify.log.error({ err, offeringId: offering.id }, 'Auto-cleansing failed');
      }
    })();

    return reply.status(201).send(offering);
  });

  // GET /offerings (optional auth — guests can browse public)
  fastify.get('/', {
    preHandler: [fastify.optionalAuthenticate, async (request) => {
      // If authenticated, populate orgScope for tenant isolation
      if (request.user?.sub) {
        const { DrizzlePermissionRepository } = await import('../../infrastructure/persistence/permission-repository');
        const permRepo = new DrizzlePermissionRepository(fastify.db);
        const orgIds = await permRepo.getOrgIdsForUser(request.user.sub);
        request.authContext = { userId: request.user.sub, role: request.user.role as Role, orgScope: orgIds };
      }
    }],
  }, async (request, reply) => {
    const query = request.query as { page?: string; limit?: string; orgId?: string; status?: string };
    const page = Math.max(1, parseInt(query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || '20', 10)));

    const role = (request.user?.role || 'guest') as Role;
    const userId = request.user?.sub;
    // Non-admin authenticated users: always pass orgScope ([] if none). Guests: undefined.
    const orgScope = request.user
      ? (role === 'administrator' ? undefined : (request.authContext?.orgScope ?? []))
      : undefined;

    const result = await offeringRepo.list({
      page,
      limit,
      orgId: query.orgId,
      status: query.status as any,
      role,
      userId,
      orgScope,
    });

    return reply.status(200).send({
      data: result.data,
      meta: {
        page,
        limit,
        total: result.total,
        totalPages: Math.ceil(result.total / limit),
      },
    });
  });

  // GET /offerings/:id (optional auth)
  fastify.get('/:id', {
    preHandler: [fastify.optionalAuthenticate, async (request) => {
      if (request.user?.sub) {
        const { DrizzlePermissionRepository } = await import('../../infrastructure/persistence/permission-repository');
        const permRepo = new DrizzlePermissionRepository(fastify.db);
        const orgIds = await permRepo.getOrgIdsForUser(request.user.sub);
        request.authContext = { userId: request.user.sub, role: request.user.role as Role, orgScope: orgIds };
      }
    }],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const offering = await offeringRepo.findByIdWithAddons(id);

    if (!offering) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Offering not found' });
    }

    // Visibility + org-scope check
    const role = (request.user?.role || 'guest') as Role;

    // Operations: enforce org scope
    if (role === 'operations') {
      const orgScope = request.authContext?.orgScope ?? [];
      if (!orgScope.includes(offering.orgId)) {
        return reply.status(404).send({ error: 'NOT_FOUND', message: 'Offering not found' });
      }
    }

    if (role !== 'administrator' && role !== 'operations') {
      // Guest/client can only see active offerings (owner/merchant can see their own in any status)
      const isOwner = request.user?.sub && offering.merchantId === request.user.sub;
      if (!isOwner && offering.status !== 'active') {
        return reply.status(404).send({ error: 'NOT_FOUND', message: 'Offering not found' });
      }
      if (offering.visibility === 'private' && !isOwner) {
        return reply.status(404).send({ error: 'NOT_FOUND', message: 'Offering not found' });
      }
      if (offering.visibility === 'restricted') {
        const hasAccess = request.user?.sub
          ? await offeringRepo.hasAccess(id, request.user.sub)
          : false;
        if (!hasAccess && !isOwner) {
          return reply.status(404).send({ error: 'NOT_FOUND', message: 'Offering not found' });
        }
      }
    }

    return reply.status(200).send(offering);
  });

  // PUT /offerings/:id
  fastify.put('/:id', {
    preHandler: [fastify.authenticate, fastify.authorize('offering', 'update')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parseResult = updateOfferingSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: parseResult.error.issues.map((i) => i.message),
      });
    }

    const existing = await offeringRepo.findById(id);
    if (!existing) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Offering not found' });
    }

    // Ownership / org-scope check
    if (request.user.role === 'merchant' && existing.merchantId !== request.user.sub) {
      return reply.status(403).send({ error: 'FORBIDDEN', message: 'You do not own this resource' });
    }
    if (request.user.role === 'operations') {
      const orgScope = request.authContext?.orgScope ?? [];
      if (!orgScope.includes(existing.orgId)) {
        return reply.status(404).send({ error: 'NOT_FOUND', message: 'Offering not found' });
      }
    }

    if (isArchived(existing.status)) {
      return reply.status(409).send({ error: 'CONFLICT', message: 'Cannot modify an archived offering' });
    }

    const updated = await offeringRepo.update(id, parseResult.data);

    request.auditContext = {
      resourceType: 'offering',
      resourceId: id,
      action: 'offering.update',
      beforeState: existing,
      afterState: updated,
    };
    await request.writeAudit();

    return reply.status(200).send(updated);
  });

  // PATCH /offerings/:id/status
  fastify.patch('/:id/status', {
    preHandler: [fastify.authenticate, fastify.authorize('offering', 'update')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parseResult = changeOfferingStatusSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: parseResult.error.issues.map((i) => i.message),
      });
    }

    const existing = await offeringRepo.findById(id);
    if (!existing) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Offering not found' });
    }

    if (request.user.role === 'merchant' && existing.merchantId !== request.user.sub) {
      return reply.status(403).send({ error: 'FORBIDDEN', message: 'You do not own this resource' });
    }
    if (request.user.role === 'operations') {
      const orgScope = request.authContext?.orgScope ?? [];
      if (!orgScope.includes(existing.orgId)) {
        return reply.status(404).send({ error: 'NOT_FOUND', message: 'Offering not found' });
      }
    }

    const transition = validateStatusTransition(existing.status, parseResult.data.status);
    if (!transition.valid) {
      return reply.status(409).send({
        error: 'INVALID_TRANSITION',
        message: transition.error,
      });
    }

    const updated = await offeringRepo.updateStatus(id, parseResult.data.status, existing.status);

    if (!updated) {
      return reply.status(409).send({
        error: 'CONFLICT',
        message: 'Offering status was modified concurrently. Please retry.',
      });
    }

    request.auditContext = {
      resourceType: 'offering',
      resourceId: id,
      action: 'offering.update',
      beforeState: { status: existing.status },
      afterState: { status: updated.status },
    };
    await request.writeAudit();

    return reply.status(200).send(updated);
  });

  // POST /offerings/:id/addons
  fastify.post('/:id/addons', {
    preHandler: [fastify.authenticate, fastify.authorize('offering', 'update')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parseResult = createAddonSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: parseResult.error.issues.map((i) => i.message),
      });
    }

    const existing = await offeringRepo.findById(id);
    if (!existing) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Offering not found' });
    }

    if (request.user.role === 'merchant' && existing.merchantId !== request.user.sub) {
      return reply.status(403).send({ error: 'FORBIDDEN', message: 'You do not own this resource' });
    }
    if (request.user.role === 'operations') {
      const orgScope = request.authContext?.orgScope ?? [];
      if (!orgScope.includes(existing.orgId)) {
        return reply.status(404).send({ error: 'NOT_FOUND', message: 'Offering not found' });
      }
    }

    try {
      const addon = await offeringRepo.createAddon(id, parseResult.data);
      request.auditContext = { resourceType: 'offering_addon', resourceId: addon.id, afterState: addon };
    await request.writeAudit();
      return reply.status(201).send(addon);
    } catch (err: any) {
      if (err.code === '23505') { // unique violation
        return reply.status(409).send({ error: 'CONFLICT', message: 'Add-on with this name already exists' });
      }
      throw err;
    }
  });

  // DELETE /offerings/:id/addons/:addonId
  fastify.delete('/:id/addons/:addonId', {
    preHandler: [fastify.authenticate, fastify.authorize('offering', 'update')],
  }, async (request, reply) => {
    const { id, addonId } = request.params as { id: string; addonId: string };

    const existing = await offeringRepo.findById(id);
    if (!existing) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Offering not found' });
    }

    if (request.user.role === 'merchant' && existing.merchantId !== request.user.sub) {
      return reply.status(403).send({ error: 'FORBIDDEN', message: 'You do not own this resource' });
    }
    if (request.user.role === 'operations') {
      const orgScope = request.authContext?.orgScope ?? [];
      if (!orgScope.includes(existing.orgId)) {
        return reply.status(404).send({ error: 'NOT_FOUND', message: 'Offering not found' });
      }
    }

    const addon = await offeringRepo.findAddonById(addonId);
    if (!addon || addon.offeringId !== id) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Add-on not found' });
    }

    await offeringRepo.deleteAddon(addonId);
    request.auditContext = { resourceType: 'offering_addon', resourceId: addonId, beforeState: addon };
    await request.writeAudit();
    return reply.status(204).send();
  });

  // POST /offerings/:id/access
  fastify.post('/:id/access', {
    preHandler: [fastify.authenticate, fastify.authorize('offering', 'update')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parseResult = grantAccessSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: parseResult.error.issues.map((i) => i.message),
      });
    }

    const existing = await offeringRepo.findById(id);
    if (!existing) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Offering not found' });
    }

    if (request.user.role === 'merchant' && existing.merchantId !== request.user.sub) {
      return reply.status(403).send({ error: 'FORBIDDEN', message: 'You do not own this resource' });
    }
    if (request.user.role === 'operations') {
      const orgScope = request.authContext?.orgScope ?? [];
      if (!orgScope.includes(existing.orgId)) {
        return reply.status(404).send({ error: 'NOT_FOUND', message: 'Offering not found' });
      }
    }

    if (existing.visibility !== 'restricted') {
      return reply.status(409).send({
        error: 'CONFLICT',
        message: 'Access grants require visibility = restricted',
      });
    }

    // Validate target users: must be clients in the same org as the offering
    const { DrizzleUserRepository } = await import('../../infrastructure/persistence/user-repository');
    const { DrizzlePermissionRepository } = await import('../../infrastructure/persistence/permission-repository');
    const userRepo = new DrizzleUserRepository(fastify.db);
    const permRepo = new DrizzlePermissionRepository(fastify.db);

    const validUserIds: string[] = [];
    const rejected: Array<{ userId: string; reason: string }> = [];

    for (const userId of parseResult.data.userIds) {
      const targetUser = await userRepo.findById(userId);
      if (!targetUser) {
        rejected.push({ userId, reason: 'User not found' });
        continue;
      }
      if (targetUser.role !== 'client') {
        rejected.push({ userId, reason: 'User is not a client' });
        continue;
      }
      const targetOrgs = await permRepo.getOrgIdsForUser(userId);
      if (!targetOrgs.includes(existing.orgId)) {
        rejected.push({ userId, reason: 'User is not in the same organization' });
        continue;
      }
      validUserIds.push(userId);
    }

    if (validUserIds.length === 0 && rejected.length > 0) {
      return reply.status(422).send({
        error: 'INVALID_TARGETS',
        message: 'No valid client users to grant access to',
        rejected,
      });
    }

    const granted = validUserIds.length > 0
      ? await offeringRepo.grantAccess(id, validUserIds, request.user.sub)
      : 0;
    request.auditContext = { resourceType: 'offering_access', resourceId: id, action: 'offering.grant_access', afterState: { granted, validUserIds } };
    await request.writeAudit();
    return reply.status(200).send({ granted, rejected: rejected.length > 0 ? rejected : undefined });
  });

  // DELETE /offerings/:id/access/:userId
  fastify.delete('/:id/access/:userId', {
    preHandler: [fastify.authenticate, fastify.authorize('offering', 'update')],
  }, async (request, reply) => {
    const { id, userId } = request.params as { id: string; userId: string };

    const existing = await offeringRepo.findById(id);
    if (!existing) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Offering not found' });
    }

    if (request.user.role === 'merchant' && existing.merchantId !== request.user.sub) {
      return reply.status(403).send({ error: 'FORBIDDEN', message: 'You do not own this resource' });
    }
    if (request.user.role === 'operations') {
      const orgScope = request.authContext?.orgScope ?? [];
      if (!orgScope.includes(existing.orgId)) {
        return reply.status(404).send({ error: 'NOT_FOUND', message: 'Offering not found' });
      }
    }

    await offeringRepo.revokeAccess(id, userId);
    request.auditContext = { resourceType: 'offering_access', resourceId: id, action: 'offering.revoke_access', beforeState: { userId } };
    await request.writeAudit();
    return reply.status(204).send();
  });
}
