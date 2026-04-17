#!/bin/bash
set -e

echo "=== StudioOps Test Suite ==="
echo ""

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Pick the right compose invocation (V2 plugin or V1 binary).
if docker compose version >/dev/null 2>&1; then
  COMPOSE="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE="docker-compose"
else
  echo "ERROR: Docker Compose is required to run the test suite." >&2
  exit 1
fi

# Seed demo data and relax rate limits so integration/E2E stages have deterministic state.
export SEED_DATA=true
export RATE_LIMIT_MULTIPLIER=1000

# Always tear down on exit — even on failure — to leave the host clean.
cleanup() {
  $COMPOSE --profile test down -v --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT

# Run the entire unit + integration + build + E2E suite inside the test-runner container
# (Node 22, DB on the compose network). This is the single source of truth for "all tests pass".
echo "Running full test suite via Docker test-runner (Node 22 in-container)..."
echo ""

$COMPOSE --profile test up \
  --build \
  --abort-on-container-exit \
  --exit-code-from test-runner

echo ""
echo "=== All tests passed ==="
