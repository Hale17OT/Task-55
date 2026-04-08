import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { sql } from 'drizzle-orm';
import { AUDIT } from '@studioops/shared';

declare module 'fastify' {
  interface FastifyInstance {
    auditRetentionTelemetry: {
      lastRunAt: string | null;
      lastSuccessAt: string | null;
      lastErrorAt: string | null;
      lastError: string | null;
      totalRuns: number;
      totalSuccesses: number;
      totalFailures: number;
      totalPurged: number;
    };
    purgeAuditLogs: () => Promise<number>;
  }
}

/**
 * Audit log retention plugin.
 *
 * Exposes `fastify.purgeAuditLogs()` for on-demand invocation (e.g. admin routes)
 * and tracks execution telemetry via `fastify.auditRetentionTelemetry`.
 *
 * Scheduling is handled externally by the `audit-purge-cron` Docker service
 * (see docker-compose.yml) which runs `packages/db/src/purge-audit.ts` daily,
 * independent of API process uptime. This guarantees retention enforcement even
 * when the API is down or restarting.
 *
 * The purge calls a SECURITY DEFINER DB function so the app role cannot
 * disable immutability triggers directly.
 */
async function auditRetentionPlugin(fastify: FastifyInstance) {
  const telemetry = {
    lastRunAt: null as string | null,
    lastSuccessAt: null as string | null,
    lastErrorAt: null as string | null,
    lastError: null as string | null,
    totalRuns: 0,
    totalSuccesses: 0,
    totalFailures: 0,
    totalPurged: 0,
  };

  fastify.decorate('auditRetentionTelemetry', telemetry);

  async function purgeOldAuditLogs(): Promise<number> {
    telemetry.totalRuns++;
    telemetry.lastRunAt = new Date().toISOString();
    try {
      const result = await fastify.db.execute(
        sql`SELECT purge_old_audit_logs(${AUDIT.RETENTION_DAYS}) AS deleted_count`,
      );

      const count = (result[0] as any)?.deleted_count ?? 0;
      telemetry.totalSuccesses++;
      telemetry.lastSuccessAt = new Date().toISOString();
      telemetry.totalPurged += count;
      fastify.log.info({
        count,
        retentionDays: AUDIT.RETENTION_DAYS,
        telemetry: { totalRuns: telemetry.totalRuns, totalFailures: telemetry.totalFailures },
      }, 'Audit retention purge completed');
      return count;
    } catch (err) {
      telemetry.totalFailures++;
      telemetry.lastErrorAt = new Date().toISOString();
      telemetry.lastError = err instanceof Error ? err.message : String(err);
      fastify.log.error({
        err,
        telemetry: { totalRuns: telemetry.totalRuns, totalFailures: telemetry.totalFailures },
      }, 'Audit log retention purge failed');
      return 0;
    }
  }

  fastify.decorate('purgeAuditLogs', purgeOldAuditLogs);
}

export default fp(auditRetentionPlugin, {
  name: 'audit-retention',
  dependencies: ['database'],
  fastify: '5.x',
});
