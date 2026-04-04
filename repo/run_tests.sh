#!/bin/bash
set -e

echo "=== StudioOps Test Suite ==="
echo ""

# Ensure we're in repo root
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Install dependencies if node_modules is missing
if [ ! -d "node_modules" ]; then
  echo "--- Installing dependencies ---"
  npm install 2>&1
  echo ""
fi

# 1. Unit tests
echo "--- [1/4] Running API unit tests ---"
cd apps/api
npx vitest run 2>&1
cd ../..
echo "✓ API unit tests passed"
echo ""

# 2. Integration tests (requires PostgreSQL at localhost:54320)
echo "--- [2/4] Running API integration tests ---"
DB_URL="${DATABASE_URL:-postgres://studioops:dev_password_change_me@localhost:54320/studioops}"
DB_HOST=$(echo "$DB_URL" | sed -E 's|.*@([^:/]+).*|\1|')
DB_PORT=$(echo "$DB_URL" | sed -E 's|.*:([0-9]+)/.*|\1|')
if pg_isready -h "$DB_HOST" -p "$DB_PORT" -q 2>/dev/null || nc -z "$DB_HOST" "$DB_PORT" 2>/dev/null; then
  cd apps/api
  DATABASE_URL="$DB_URL" npx vitest run --config vitest.integration.config.ts 2>&1
  cd ../..
  echo "✓ API integration tests passed"
else
  echo "⚠ Skipped (PostgreSQL not reachable at $DB_HOST:$DB_PORT). Start DB to run integration tests."
fi
echo ""

# 3. Angular build check
echo "--- [3/4] Running Angular build check ---"
cd apps/web
npx ng build --configuration=production 2>&1
cd ../..
echo "✓ Angular build passed"
echo ""

# 4. E2E tests (requires running API server)
echo "--- [4/4] Running Playwright E2E tests ---"
if curl -s http://localhost:3100/api/v1/health > /dev/null 2>&1; then
  API_URL="http://localhost:3100" npx playwright test --config e2e/playwright.config.ts --project=api 2>&1
  echo "✓ E2E tests passed"
elif curl -s http://localhost:3000/api/v1/health > /dev/null 2>&1; then
  API_URL="http://localhost:3000" npx playwright test --config e2e/playwright.config.ts --project=api 2>&1
  echo "✓ E2E tests passed"
else
  echo "⚠ API server not running, skipping E2E tests"
fi
echo ""

echo "=== All tests passed ==="
