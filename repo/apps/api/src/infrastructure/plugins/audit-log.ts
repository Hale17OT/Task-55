import { FastifyInstance, FastifyRequest } from 'fastify';
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
    /** True if audit was already written by the route handler via writeAudit() */
    _auditWritten?: boolean;
    /** Re-entry guard for onSend audit hook */
    _auditHookRan?: boolean;
    /** Write audit entry synchronously before sending response. Throws on failure. */
    writeAudit: () => Promise<void>;
  }
}

const MAX_RETRY = 3;
const RETRY_DELAY_MS = 100;
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
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
        'AUDIT_FAILURE: Failed to persist audit log after retries.');
      return false;
    }
  }
  return false;
}

function buildAuditEntry(request: FastifyRequest) {
  const auditCtx = request.auditContext;
  return {
    actorId: request.user?.sub || null,
    action: auditCtx?.action || `${request.method} ${request.routeOptions?.url || request.url}`,
    resourceType: auditCtx?.resourceType || inferResourceType(request.url),
    resourceId: auditCtx?.resourceId || null,
    beforeState: auditCtx?.beforeState || null,
    afterState: auditCtx?.afterState || null,
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'] || null,
  };
}

async function auditLogPlugin(fastify: FastifyInstance) {
  // Decorate every request with writeAudit() for explicit use in routes.
  fastify.addHook('onRequest', async (request) => {
    request._auditWritten = false;
    request._auditHookRan = false;
    request.writeAudit = async () => {
      const entry = buildAuditEntry(request);
      const ok = await insertAuditWithRetry(fastify.db, entry, request.log);
      if (!ok) {
        throw new Error('AUDIT_PERSISTENCE_FAILURE');
      }
      request._auditWritten = true;
    };
  });

  // Fail-closed audit via onSend (pre-response).
  // onSend fires BEFORE the response body is sent to the client. On audit failure
  // for successful responses, the payload is replaced with a 500 error inline
  // (never throw in onSend — that causes ERR_HTTP_HEADERS_SENT in Fastify 5).
  // Write operations MUST use writeAudit() in route handlers — no fallback.
  fastify.addHook('onSend', async (request, reply, payload) => {
    if (request._auditWritten) return payload;
    if (request._auditHookRan) return payload;
    request._auditHookRan = true;
    if (!request.url.startsWith('/api/v1/') || request.url === '/api/v1/health') return payload;

    // Successful write operations: MUST have called writeAudit() — invariant violation.
    // Replace the response with a 500 to block the un-audited write from reaching the client.
    if (WRITE_METHODS.has(request.method) && reply.statusCode < 400) {
      const msg = `AUDIT_VIOLATION: ${request.method} ${request.url} (${reply.statusCode}) completed without writeAudit(). Add auditContext + writeAudit() to this route.`;
      request.log.fatal({ method: request.method, url: request.url, statusCode: reply.statusCode }, msg);
      reply.code(500);
      reply.header('content-type', 'application/json');
      return JSON.stringify({ error: 'AUDIT_VIOLATION', message: msg });
    }

    // All remaining protected requests (reads, failed writes): guaranteed durable audit.
    // Fail-closed: if audit persistence fails after retries, replace the response with a
    // 500 error regardless of the original status code. This ensures every protected action
    // — including denied requests — generates an immutable audit record before delivery.
    const entry = buildAuditEntry(request);
    const ok = await insertAuditWithRetry(fastify.db, entry, request.log);
    if (!ok) {
      const msg = 'AUDIT_PERSISTENCE_FAILURE: Could not persist audit record for protected action after retries.';
      request.log.fatal({
        auditEntry: entry,
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
      }, msg);
      reply.code(500);
      reply.header('content-type', 'application/json');
      return JSON.stringify({ error: 'AUDIT_PERSISTENCE_FAILURE', message: msg });
    }

    return payload;
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
