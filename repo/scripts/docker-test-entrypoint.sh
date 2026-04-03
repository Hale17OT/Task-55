#!/bin/sh
set -e

echo "=== StudioOps Docker Test Runner ==="
echo ""

# Seed the database with demo data for E2E tests
echo "Seeding test data..."
cd /app/packages/db
npx tsx src/seed-full.ts 2>&1 || echo "Seed completed (may already exist)"
cd /app

echo ""
echo "Running full test suite (CI=true, all stages mandatory)..."
echo ""

# Run the existing test runner — CI=true makes it fail if any stage is skipped
exec node --experimental-vm-modules scripts/run-tests.js
