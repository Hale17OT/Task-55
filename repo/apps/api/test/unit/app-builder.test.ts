import { describe, it, expect, vi, beforeEach } from 'vitest';

// We can't easily test buildApp without a real DB, so we test the config/structure expectations
// The full app builder is tested in integration tests

describe('App Builder structure', () => {
  it('exports buildApp function', async () => {
    const mod = await import('../../src/app.js');
    expect(typeof mod.buildApp).toBe('function');
  });
});
