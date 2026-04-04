#!/usr/bin/env node

/**
 * Cross-platform test runner for StudioOps.
 * Runs: unit tests → integration tests → Angular build check → E2E tests (if API running).
 * Usage: node scripts/run-tests.js
 *
 * CI mode: Set CI=true to fail when integration or E2E stages are skipped.
 *   CI=true DATABASE_URL=... API_URL=... node scripts/run-tests.js
 */

import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const strict = process.env.CI === 'true';
const skipped = [];

function run(label, cmd, cwd = root) {
  console.log(`\n--- ${label} ---`);
  try {
    execSync(cmd, { cwd, stdio: 'inherit', env: { ...process.env, FORCE_COLOR: '1' } });
    console.log(`✓ ${label} passed`);
  } catch {
    console.error(`✗ ${label} FAILED`);
    process.exit(1);
  }
}

console.log('=== StudioOps Test Suite ===\n');

// 1. Unit tests
run('[1/4] API Unit Tests', 'npx vitest run', resolve(root, 'apps/api'));

// 2. Integration tests (requires DATABASE_URL)
if (process.env.DATABASE_URL) {
  run('[2/4] API Integration Tests', 'npx vitest run --config vitest.integration.config.ts', resolve(root, 'apps/api'));
} else {
  console.log('\n--- [2/4] API Integration Tests ---');
  console.log('⚠ Skipped (DATABASE_URL not set). Set DATABASE_URL to run integration tests.');
  skipped.push('integration');
}

// 3. Angular build (skip in Docker — the web service build already validates this)
if (process.env.SKIP_ANGULAR_BUILD !== 'true') {
  run('[3/4] Angular Build Check', 'npx ng build --configuration=production', resolve(root, 'apps/web'));
} else {
  console.log('\n--- [3/4] Angular Build Check ---');
  console.log('⚠ Skipped (SKIP_ANGULAR_BUILD=true — web service build validates this).');
}

// 4. E2E tests (if API is running)
const apiUrl = process.env.API_URL || 'http://localhost:3100';
try {
  const http = await import('node:http');
  await new Promise((resolve, reject) => {
    http.get(`${apiUrl}/api/v1/health`, (res) => {
      if (res.statusCode === 200) resolve(true);
      else reject(new Error(`API returned ${res.statusCode}`));
    }).on('error', reject);
  });
  run('[4/4] Playwright E2E Tests', `npx playwright test --config e2e/playwright.config.ts --project=api`, root);
} catch {
  console.log('\n--- [4/4] Playwright E2E Tests ---');
  console.log(`⚠ Skipped (API not reachable at ${apiUrl}). Start API to run E2E tests.`);
  skipped.push('e2e');
}

if (strict && skipped.length > 0) {
  console.error(`\n✗ CI mode: ${skipped.join(', ')} stage(s) were skipped. Set DATABASE_URL and API_URL to run all stages.`);
  process.exit(1);
}

console.log('\n=== All available tests passed ===');
