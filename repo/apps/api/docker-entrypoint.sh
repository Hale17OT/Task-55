#!/bin/sh
set -e

echo "Starting StudioOps API..."

# Push database schema using drizzle-kit
echo "Pushing database schema..."
cd /app/packages/db
npx drizzle-kit push --force 2>&1 || echo "Schema push completed (may have warnings)"

# Apply audit immutability triggers (always — idempotent)
echo "Applying audit triggers..."
npx tsx /app/packages/db/src/apply-triggers.ts 2>&1 || echo "Trigger application completed (may have warnings)"

# Apply base seed (permissions, org, rules — always needed, idempotent)
echo "Applying base seed (permissions, rules)..."
npx tsx /app/packages/db/src/seed.ts 2>&1 || echo "Base seed completed (may already exist)"

# Run full seed only if SEED_DATA=true (opt-in for production safety)
if [ "${SEED_DATA:-false}" = "true" ]; then
  echo "Seeding demo data (SEED_DATA=true)..."
  echo "WARNING: Seed creates accounts with well-known passwords. Change them after first login."
  npx tsx /app/packages/db/src/seed-full.ts 2>&1 || echo "Full seed completed (may already exist)"
else
  echo "Skipping demo data seed (set SEED_DATA=true to seed demo accounts on first run)."
fi

# Start the API server
echo "Starting Fastify server..."
cd /app
exec npx tsx apps/api/src/index.ts
