import { randomBytes, createHash } from 'node:crypto';

export interface RefreshTokenPair {
  plaintext: string;
  hash: string;
}

export function generateRefreshToken(): RefreshTokenPair {
  const plaintext = randomBytes(32).toString('base64url');
  const hash = createHash('sha256').update(plaintext).digest('hex');
  return { plaintext, hash };
}

export function hashRefreshToken(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex');
}
