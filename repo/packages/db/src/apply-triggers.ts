/**
 * Applies audit immutability triggers to the database.
 * Idempotent — safe to run multiple times.
 * Used by both Docker entrypoint and local development setup.
 */
import postgres from 'postgres';

export async function applyAuditTriggers(connectionString: string): Promise<void> {
  const client = postgres(connectionString, { max: 1 });

  console.log('Applying audit immutability triggers...');

  await client`
    CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
    RETURNS TRIGGER AS $$
    BEGIN
      RAISE EXCEPTION 'audit_logs table is immutable: % operations are forbidden', TG_OP;
      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql
  `;

  // Create triggers idempotently (drop-if-exists + create)
  await client`
    DO $$ BEGIN
      CREATE TRIGGER audit_logs_no_update
        BEFORE UPDATE ON audit_logs
        FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$
  `;

  await client`
    DO $$ BEGIN
      CREATE TRIGGER audit_logs_no_delete
        BEFORE DELETE ON audit_logs
        FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$
  `;

  // Create a SECURITY DEFINER function for retention purge.
  // This runs with the privileges of the DB owner (who created it),
  // so the app role cannot disable triggers directly — only call this function.
  await client`
    CREATE OR REPLACE FUNCTION purge_old_audit_logs(retention_days integer)
    RETURNS integer
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
    DECLARE
      deleted_count integer;
    BEGIN
      -- Only the purge function (running as definer) can disable the trigger
      ALTER TABLE audit_logs DISABLE TRIGGER audit_logs_no_delete;

      DELETE FROM audit_logs WHERE created_at < (now() - (retention_days || ' days')::interval);
      GET DIAGNOSTICS deleted_count = ROW_COUNT;

      ALTER TABLE audit_logs ENABLE TRIGGER audit_logs_no_delete;
      RETURN deleted_count;
    EXCEPTION WHEN OTHERS THEN
      -- Re-enable trigger even on error
      ALTER TABLE audit_logs ENABLE TRIGGER audit_logs_no_delete;
      RAISE;
    END;
    $$
  `;

  // Revoke trigger management from the studioops app role if it exists.
  // This prevents the runtime app from disabling audit immutability triggers.
  // The SECURITY DEFINER purge function retains necessary privileges.
  try {
    await client`REVOKE ALL ON FUNCTION prevent_audit_log_mutation() FROM studioops`;
    // Revoke ALTER TABLE on audit_logs from app role
    await client`REVOKE ALL PRIVILEGES ON TABLE audit_logs FROM studioops`;
    await client`GRANT SELECT, INSERT ON TABLE audit_logs TO studioops`;
  } catch {
    // Role may not exist yet or may be the owner — skip silently
  }

  console.log('Audit triggers and retention function applied.');
  await client.end();
}

// Run directly
const dbUrl = process.env.DATABASE_URL;
if (dbUrl) {
  applyAuditTriggers(dbUrl).catch((err) => {
    console.error('Failed to apply audit triggers:', err);
    process.exit(1);
  });
}
