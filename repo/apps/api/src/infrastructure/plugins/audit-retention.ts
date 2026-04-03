import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { sql } from 'drizzle-orm';
import { AUDIT } from '@studioops/shared';

/**
 * Audit log retention plugin.
 * Runs daily to purge audit entries older than 365 days.
 * Calls a SECURITY DEFINER DB function so the app role cannot
 * disable immutability triggers directly — only the DB-owned
 * function has that privilege.
 */
async function auditRetentionPlugin(fastify: FastifyInstance) {
  const PURGE_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
  let timer: ReturnType<typeof setInterval> | null = null;

  async function purgeOldAuditLogs(): Promise<number> {
    try {
      const result = await fastify.db.execute(
        sql`SELECT purge_old_audit_logs(${AUDIT.RETENTION_DAYS}) AS deleted_count`,
      );

      const count = (result[0] as any)?.deleted_count ?? 0;
      if (count > 0) {
        fastify.log.info({ count, retentionDays: AUDIT.RETENTION_DAYS }, 'Purged old audit log entries');
      }
      return count;
    } catch (err) {
      fastify.log.error({ err }, 'Audit log retention purge failed');
      return 0;
    }
  }

  // Schedule daily purge (first run after 1 minute, then every 24 hours)
  fastify.addHook('onReady', () => {
    setTimeout(() => {
      purgeOldAuditLogs();
      timer = setInterval(purgeOldAuditLogs, PURGE_INTERVAL_MS);
    }, 60_000);
  });

  fastify.addHook('onClose', () => {
    if (timer) clearInterval(timer);
  });
}

export default fp(auditRetentionPlugin, {
  name: 'audit-retention',
  dependencies: ['database'],
  fastify: '5.x',
});
