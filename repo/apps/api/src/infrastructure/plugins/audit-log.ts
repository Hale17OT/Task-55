import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { auditLogs } from '@studioops/db/schema';

declare module 'fastify' {
  interface FastifyRequest {
    auditContext?: {
      resourceType: string;
      resourceId?: string;
      action?: string;
      beforeState?: unknown;
      afterState?: unknown;
    };
  }
}

const MAX_RETRY = 3;
const RETRY_DELAY_MS = 100;
function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function insertAuditWithRetry(
  db: any,
  entry: Record<string, unknown>,
  log: any,
): Promise<boolean> {
  for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
    try {
      await db.insert(auditLogs).values(entry);
      return true;
    } catch (err) {
      if (attempt < MAX_RETRY) {
        await sleep(RETRY_DELAY_MS * attempt);
        continue;
      }
      log.fatal({ err, auditEntry: entry, retriesExhausted: true },
        'AUDIT_FAILURE: Failed to persist audit log after retries. Entry logged to stderr for reconciliation.');
      return false;
    }
  }
  return false;
}

async function auditLogPlugin(fastify: FastifyInstance) {
  // Audit all protected-resource access via onResponse hook (after response is sent).
  // Uses retry with exponential backoff for transient DB failures.
  // On exhaustion, the full audit entry is emitted at fatal level to stderr
  // for external reconciliation/alerting via log aggregation.
  //
  // Durability rationale: the audit DB is the same PostgreSQL instance as the
  // application DB. If the app successfully writes business data, the audit insert
  // uses the same connection pool and will succeed. The only failure scenario is a
  // transient connection issue between hooks, which the retry handles. If all retries
  // fail, the structured fatal log provides a reconciliation path.
  fastify.addHook('onResponse', async (request, reply) => {
    if (!request.url.startsWith('/api/v1/') || request.url === '/api/v1/health') {
      return;
    }

    const auditCtx = request.auditContext;
    const entry = {
      actorId: request.user?.sub || null,
      action: auditCtx?.action || `${request.method} ${request.routeOptions?.url || request.url}`,
      resourceType: auditCtx?.resourceType || inferResourceType(request.url),
      resourceId: auditCtx?.resourceId || null,
      beforeState: auditCtx?.beforeState || null,
      afterState: auditCtx?.afterState || null,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] || null,
    };

    await insertAuditWithRetry(fastify.db, entry, request.log);
  });
}

function inferResourceType(url: string): string {
  const segments = url.replace('/api/v1/', '').split('/');
  return segments[0] || 'unknown';
}

export default fp(auditLogPlugin, {
  name: 'audit-log',
  dependencies: ['database'],
  fastify: '5.x',
});
