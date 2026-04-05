import { FastifyInstance } from 'fastify';
import { validateDateRange, type DashboardFilters } from '../../core/domain/analytics';
import { DrizzleAnalyticsRepository } from '../../infrastructure/persistence/analytics-repository';
import { generateCsv, generateExcel } from '../../infrastructure/export/export-service';

export default async function analyticsRoutes(fastify: FastifyInstance) {
  const analyticsRepo = new DrizzleAnalyticsRepository(fastify.db);

  // GET /analytics/dashboard
  fastify.get('/dashboard', {
    preHandler: [fastify.authenticate, fastify.authorize('analytics', 'view')],
  }, async (request, reply) => {
    const query = request.query as { from?: string; to?: string; orgId?: string; eventType?: string };

    const now = new Date();
    const from = query.from ? new Date(query.from) : new Date(now.getTime() - 30 * 86400000);
    const to = query.to ? new Date(query.to) : now;

    const dateValidation = validateDateRange(from, to);
    if (!dateValidation.valid) {
      return reply.status(422).send({ error: 'INVALID_DATE_RANGE', message: dateValidation.error });
    }

    // Org scoping
    let orgId = query.orgId;
    if (request.user.role === 'operations') {
      if (orgId && request.authContext?.orgScope && !request.authContext.orgScope.includes(orgId)) {
        return reply.status(403).send({ error: 'FORBIDDEN_ORG_ACCESS', message: 'Organization not in your scope' });
      }
    }

    const filters: DashboardFilters = { from, to, orgId, eventType: query.eventType };
    // Admin: undefined orgScope (sees all). Non-admin: always an array (possibly empty = sees nothing).
    const orgScope = request.user.role === 'administrator' ? undefined : (request.authContext?.orgScope ?? []);

    const payload = await analyticsRepo.getDashboard(filters, orgScope);

    return reply.status(200).send(payload);
  });

  // POST /analytics/export (rules-engine enforced cooldown)
  fastify.post('/export', {
    preHandler: [fastify.authenticate, fastify.authorize('analytics', 'export'), fastify.enforceQuota('export_cooldown')],
  }, async (request, reply) => {
    const body = request.body as { format: string; filters?: { from?: string; to?: string; orgId?: string; eventType?: string } };

    if (!body.format || !['csv', 'xlsx'].includes(body.format)) {
      return reply.status(422).send({ error: 'INVALID_EXPORT_FORMAT', message: 'Format must be csv or xlsx', accepted: ['csv', 'xlsx'] });
    }

    const now = new Date();
    const from = body.filters?.from ? new Date(body.filters.from) : new Date(now.getTime() - 30 * 86400000);
    const to = body.filters?.to ? new Date(body.filters.to) : now;

    const dateValidation = validateDateRange(from, to);
    if (!dateValidation.valid) {
      return reply.status(422).send({ error: 'INVALID_DATE_RANGE', message: dateValidation.error });
    }

    // Org scoping (same as dashboard)
    let orgId = body.filters?.orgId;
    if (request.user.role === 'operations') {
      if (orgId && request.authContext?.orgScope && !request.authContext.orgScope.includes(orgId)) {
        return reply.status(403).send({ error: 'FORBIDDEN_ORG_ACCESS', message: 'Organization not in your scope' });
      }
    }

    const filters: DashboardFilters = { from, to, orgId, eventType: body.filters?.eventType };
    const orgScope = request.user.role === 'administrator' ? undefined : (request.authContext?.orgScope ?? []);

    const payload = await analyticsRepo.getDashboard(filters, orgScope);

    request.auditContext = { resourceType: 'analytics', action: 'analytics.export' };
    await request.writeAudit();

    // Cooldown is enforced by rules-engine preHandler (export_cooldown rule)
    const dateStr = now.toISOString().split('T')[0];

    if (body.format === 'csv') {
      const csv = generateCsv(payload);
      return reply
        .header('Content-Type', 'text/csv')
        .header('Content-Disposition', `attachment; filename="analytics-${dateStr}.csv"`)
        .send(csv);
    }

    if (body.format === 'xlsx') {
      const buffer = await generateExcel(payload);
      return reply
        .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        .header('Content-Disposition', `attachment; filename="analytics-${dateStr}.xlsx"`)
        .send(buffer);
    }
  });
}
