/**
 * Standalone audit log retention purge script.
 * Intended to be run by an external scheduler (cron, Docker cron service, etc.)
 * independent of the API process, ensuring retention enforcement even when
 * the API is down or restarting.
 *
 * Usage: DATABASE_URL=... npx tsx packages/db/src/purge-audit.ts
 */
import postgres from 'postgres';

const RETENTION_DAYS = parseInt(process.env.AUDIT_RETENTION_DAYS || '365', 10);

async function purge(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }

  const client = postgres(dbUrl, { max: 1 });

  try {
    const result = await client`SELECT purge_old_audit_logs(${RETENTION_DAYS}) AS deleted_count`;
    const count = (result[0] as any)?.deleted_count ?? 0;
    console.log(JSON.stringify({
      event: 'audit_purge_completed',
      deletedCount: count,
      retentionDays: RETENTION_DAYS,
      timestamp: new Date().toISOString(),
    }));
  } catch (err) {
    console.error(JSON.stringify({
      event: 'audit_purge_failed',
      error: err instanceof Error ? err.message : String(err),
      retentionDays: RETENTION_DAYS,
      timestamp: new Date().toISOString(),
    }));
    process.exit(1);
  } finally {
    await client.end();
  }
}

purge();
