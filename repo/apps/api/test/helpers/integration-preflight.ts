/**
 * Integration test preflight check.
 * Verifies the database is reachable before running integration tests.
 * Exits with a clear message if the DB is unavailable, instead of failing with ECONNREFUSED.
 */
import { createConnection } from 'node:net';

const DB_URL = process.env.DATABASE_URL || 'postgres://studioops:dev_password_change_me@localhost:54320/studioops';

function parseHostPort(url: string): { host: string; port: number } {
  const match = url.match(/@([^:/]+):(\d+)\//);
  return {
    host: match?.[1] ?? 'localhost',
    port: match ? parseInt(match[2], 10) : 54320,
  };
}

export async function setup() {
  const { host, port } = parseHostPort(DB_URL);

  const reachable = await new Promise<boolean>((resolve) => {
    const socket = createConnection({ host, port, timeout: 3000 });
    socket.on('connect', () => { socket.destroy(); resolve(true); });
    socket.on('error', () => { socket.destroy(); resolve(false); });
    socket.on('timeout', () => { socket.destroy(); resolve(false); });
  });

  if (!reachable) {
    console.error('');
    console.error(`╔══════════════════════════════════════════════════════════════╗`);
    console.error(`║  Integration tests require PostgreSQL at ${host}:${port}`.padEnd(63) + '║');
    console.error(`║  Start DB: docker compose up db -d`.padEnd(63) + '║');
    console.error(`╚══════════════════════════════════════════════════════════════╝`);
    console.error('');

    // In CI or strict mode: fail hard. In local dev (SKIP_INTEGRATION=true): skip gracefully.
    if (process.env.CI === 'true' || process.env.SKIP_INTEGRATION !== 'true') {
      console.error('Failing (set SKIP_INTEGRATION=true to skip in local dev).');
      process.exit(1);
    }
    console.error('Skipping (SKIP_INTEGRATION=true).');
    process.exit(0);
  }
}
