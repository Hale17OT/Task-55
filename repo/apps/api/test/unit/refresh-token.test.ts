import { describe, it, expect } from 'vitest';
import { generateRefreshToken, hashRefreshToken } from '../../src/core/domain/refresh-token';

describe('RefreshToken', () => {
  it('generates a base64url plaintext token', () => {
    const pair = generateRefreshToken();
    expect(pair.plaintext).toBeTruthy();
    expect(pair.plaintext.length).toBeGreaterThan(20);
    // base64url: only alphanumeric, hyphen, underscore
    expect(/^[A-Za-z0-9_-]+$/.test(pair.plaintext)).toBe(true);
  });

  it('generates a SHA-256 hex hash', () => {
    const pair = generateRefreshToken();
    expect(pair.hash).toBeTruthy();
    expect(pair.hash.length).toBe(64); // SHA-256 hex = 64 chars
    expect(/^[a-f0-9]+$/.test(pair.hash)).toBe(true);
  });

  it('hashRefreshToken produces same hash as generated pair', () => {
    const pair = generateRefreshToken();
    const reHashed = hashRefreshToken(pair.plaintext);
    expect(reHashed).toBe(pair.hash);
  });

  it('generates different tokens each call', () => {
    const pair1 = generateRefreshToken();
    const pair2 = generateRefreshToken();
    expect(pair1.plaintext).not.toBe(pair2.plaintext);
    expect(pair1.hash).not.toBe(pair2.hash);
  });
});
