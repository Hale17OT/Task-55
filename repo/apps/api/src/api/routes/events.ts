import { FastifyInstance } from 'fastify';
import {
  createEventSchema,
  updateEventSchema,
  changeEventStatusSchema,
  createRegistrationSchema,
  changeRegistrationStatusSchema,
} from '@studioops/shared';
import { validateEventTransition, validateRegistrationTransition, isTerminalEventStatus } from '../../core/domain/event';
import { DrizzleEventRepository } from '../../infrastructure/persistence/event-repository';

export default async function eventRoutes(fastify: FastifyInstance) {
  const eventRepo = new DrizzleEventRepository(fastify.db);

  // POST /events
  fastify.post('/', {
    preHandler: [fastify.authenticate, fastify.authorize('event', 'create')],
  }, async (request, reply) => {
    const parseResult = createEventSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: parseResult.error.issues.map((i) => i.message),
      });
    }

    const { orgId, scheduledAt, ...rest } = parseResult.data;

    if (request.authContext?.orgScope && !request.authContext.orgScope.includes(orgId)) {
      return reply.status(403).send({ error: 'FORBIDDEN', message: 'You are not a member of this organization' });
    }

    const event = await eventRepo.createEvent({
      ...rest,
      orgId,
      scheduledAt: new Date(scheduledAt),
      merchantId: request.user.sub,
    });

    request.auditContext = { resourceType: 'event', resourceId: event.id, afterState: event };
    return reply.status(201).send(event);
  });

  // GET /events
  fastify.get('/', {
    preHandler: [fastify.authenticate, fastify.authorize('event', 'read')],
  }, async (request, reply) => {
    const query = request.query as { page?: string; limit?: string; orgId?: string; eventType?: string; status?: string; from?: string; to?: string };
    const page = Math.max(1, parseInt(query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || '20', 10)));

    const result = await eventRepo.listEvents({
      page,
      limit,
      orgId: query.orgId,
      orgScope: request.authContext?.orgScope,
      eventType: query.eventType,
      status: query.status as any,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
    });

    return reply.status(200).send({
      data: result.data,
      meta: { page, limit, total: result.total, totalPages: Math.ceil(result.total / limit) },
    });
  });

  // GET /events/:id (with org-scope enforcement)
  fastify.get('/:id', {
    preHandler: [fastify.authenticate, fastify.authorize('event', 'read')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const event = await eventRepo.findEventById(id);
    if (!event) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Event not found' });

    // Object-level org check: non-admin must have event's org in their scope
    if (request.user.role !== 'administrator') {
      const orgScope = request.authContext?.orgScope ?? [];
      if (!orgScope.includes(event.orgId)) {
        return reply.status(404).send({ error: 'NOT_FOUND', message: 'Event not found' });
      }
    }

    return reply.status(200).send(event);
  });

  // PUT /events/:id
  fastify.put('/:id', {
    preHandler: [fastify.authenticate, fastify.authorize('event', 'update')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parseResult = updateEventSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', message: 'Validation failed', details: parseResult.error.issues.map((i) => i.message) });
    }

    const existing = await eventRepo.findEventById(id);
    if (!existing) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Event not found' });

    if (request.user.role === 'merchant' && existing.merchantId !== request.user.sub) {
      return reply.status(403).send({ error: 'FORBIDDEN', message: 'You do not own this resource' });
    }
    if (request.user.role === 'operations') {
      const orgScope = request.authContext?.orgScope ?? [];
      if (!orgScope.includes(existing.orgId)) {
        return reply.status(403).send({ error: 'FORBIDDEN', message: 'Resource outside your organization scope' });
      }
    }

    if (isTerminalEventStatus(existing.status)) {
      return reply.status(409).send({ error: 'CONFLICT', message: `Cannot modify a ${existing.status} event` });
    }

    const data: any = { ...parseResult.data };
    if (data.scheduledAt) data.scheduledAt = new Date(data.scheduledAt);

    const updated = await eventRepo.updateEvent(id, data);
    request.auditContext = { resourceType: 'event', resourceId: id, beforeState: existing, afterState: updated };
    return reply.status(200).send(updated);
  });

  // PATCH /events/:id/status
  fastify.patch('/:id/status', {
    preHandler: [fastify.authenticate, fastify.authorize('event', 'update')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parseResult = changeEventStatusSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', message: 'Validation failed', details: parseResult.error.issues.map((i) => i.message) });
    }

    const existing = await eventRepo.findEventById(id);
    if (!existing) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Event not found' });

    if (request.user.role === 'merchant' && existing.merchantId !== request.user.sub) {
      return reply.status(403).send({ error: 'FORBIDDEN', message: 'You do not own this resource' });
    }
    if (request.user.role === 'operations') {
      const orgScope = request.authContext?.orgScope ?? [];
      if (!orgScope.includes(existing.orgId)) {
        return reply.status(403).send({ error: 'FORBIDDEN', message: 'Resource outside your organization scope' });
      }
    }

    const transition = validateEventTransition(existing.status, parseResult.data.status);
    if (!transition.valid) {
      return reply.status(409).send({ error: 'INVALID_TRANSITION', message: transition.error });
    }

    const updated = await eventRepo.updateEventStatus(id, parseResult.data.status);
    request.auditContext = { resourceType: 'event', resourceId: id, beforeState: { status: existing.status }, afterState: { status: updated.status } };
    return reply.status(200).send(updated);
  });

  // Helper: resolve parent event and enforce org/ownership scope
  async function authorizeEventAccess(request: any, reply: any, eventId: string) {
    const event = await eventRepo.findEventById(eventId);
    if (!event) { reply.status(404).send({ error: 'NOT_FOUND', message: 'Event not found' }); return null; }

    if (request.user.role !== 'administrator') {
      const orgScope = request.authContext?.orgScope ?? [];
      if (request.user.role === 'merchant' && event.merchantId !== request.user.sub) {
        reply.status(403).send({ error: 'FORBIDDEN', message: 'You do not own this event' });
        return null;
      }
      if (request.user.role === 'operations' && !orgScope.includes(event.orgId)) {
        reply.status(404).send({ error: 'NOT_FOUND', message: 'Event not found' });
        return null;
      }
      // Client: can only interact with events from orgs they're in, or any public event
      if (request.user.role === 'client' && !orgScope.includes(event.orgId)) {
        reply.status(404).send({ error: 'NOT_FOUND', message: 'Event not found' });
        return null;
      }
    }
    return event;
  }

  // POST /events/:eventId/registrations
  fastify.post('/:eventId/registrations', {
    preHandler: [fastify.authenticate, fastify.authorize('registration', 'create')],
  }, async (request, reply) => {
    const { eventId } = request.params as { eventId: string };

    const event = await authorizeEventAccess(request, reply, eventId);
    if (!event) return;

    if (isTerminalEventStatus(event.status)) {
      return reply.status(409).send({ error: 'CONFLICT', message: `Cannot register for a ${event.status} event` });
    }

    // Validate body with schema
    const parseResult = createRegistrationSchema.safeParse(request.body || {});
    if (!parseResult.success) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', message: 'Validation failed', details: parseResult.error.issues.map((i: any) => i.message) });
    }

    // Clients self-register. Non-client actors must specify a valid clientId.
    let clientId: string;
    if (request.user.role === 'client') {
      clientId = request.user.sub;
    } else {
      if (!parseResult.data.clientId) {
        return reply.status(422).send({ error: 'CLIENT_ID_REQUIRED', message: 'Non-client actors must specify a clientId' });
      }
      clientId = parseResult.data.clientId;

      // Validate target: must be an existing client in the same org as the event
      const { DrizzleUserRepository } = await import('../../infrastructure/persistence/user-repository');
      const { DrizzlePermissionRepository } = await import('../../infrastructure/persistence/permission-repository');
      const targetUser = await new DrizzleUserRepository(fastify.db).findById(clientId);
      if (!targetUser) {
        return reply.status(422).send({ error: 'INVALID_CLIENT', message: 'Target user not found' });
      }
      if (targetUser.role !== 'client') {
        return reply.status(422).send({ error: 'INVALID_CLIENT', message: 'Target user is not a client' });
      }
      const targetOrgs = await new DrizzlePermissionRepository(fastify.db).getOrgIdsForUser(clientId);
      if (!targetOrgs.includes(event.orgId)) {
        return reply.status(422).send({ error: 'INVALID_CLIENT', message: 'Target client is not in the event organization' });
      }
    }

    try {
      const reg = await eventRepo.createRegistration({ eventId, clientId });
      request.auditContext = { resourceType: 'registration', resourceId: reg.id, afterState: reg };
      return reply.status(201).send(reg);
    } catch (err: any) {
      if (err.code === '23505') { // unique_violation
        return reply.status(409).send({ error: 'ALREADY_REGISTERED', message: 'Already registered for this event' });
      }
      throw err;
    }
  });

  // GET /events/:eventId/registrations (scoped to parent event)
  fastify.get('/:eventId/registrations', {
    preHandler: [fastify.authenticate, fastify.authorize('registration', 'read')],
  }, async (request, reply) => {
    const { eventId } = request.params as { eventId: string };

    // Enforce event-level authorization before listing registrations
    const event = await authorizeEventAccess(request, reply, eventId);
    if (!event) return;

    const query = request.query as { page?: string; limit?: string };
    const page = Math.max(1, parseInt(query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || '20', 10)));

    // Clients can only see their own registrations (user-level isolation)
    const clientId = request.user.role === 'client' ? request.user.sub : undefined;

    const result = await eventRepo.listRegistrations(eventId, page, limit, clientId);
    return reply.status(200).send({
      data: result.data,
      meta: { page, limit, total: result.total, totalPages: Math.ceil(result.total / limit) },
    });
  });

  // PATCH /registrations/:id/status (resolve parent event for authorization)
  fastify.patch('/registrations/:id/status', {
    preHandler: [fastify.authenticate, fastify.authorize('registration', 'update')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parseResult = changeRegistrationStatusSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', message: 'Validation failed', details: parseResult.error.issues.map((i) => i.message) });
    }

    const existing = await eventRepo.findRegistrationById(id);
    if (!existing) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Registration not found' });

    // Resolve parent event and enforce authorization
    const event = await authorizeEventAccess(request, reply, existing.eventId);
    if (!event) return;

    const transition = validateRegistrationTransition(existing.status, parseResult.data.status);
    if (!transition.valid) {
      return reply.status(409).send({ error: 'INVALID_TRANSITION', message: transition.error });
    }

    const now = new Date();
    const extras: any = {};
    if (parseResult.data.status === 'confirmed') extras.confirmedAt = now;
    if (parseResult.data.status === 'attended') extras.arrivedAt = now;
    if (parseResult.data.status === 'cancelled') {
      extras.cancelledAt = now;
      extras.cancelReason = parseResult.data.cancelReason;
    }

    const updated = await eventRepo.updateRegistrationStatus(id, parseResult.data.status, extras);
    request.auditContext = { resourceType: 'registration', resourceId: id, beforeState: { status: existing.status }, afterState: { status: updated.status } };
    return reply.status(200).send(updated);
  });
}
