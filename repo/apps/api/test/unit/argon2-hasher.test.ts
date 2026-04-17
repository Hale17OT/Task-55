import { describe, it, expect } from 'vitest';
import { Argon2Hasher } from '../../src/infrastructure/crypto/argon2-hasher';

describe('Argon2Hasher', () => {
  const hasher = new Argon2Hasher();

  it('hash + verify roundtrips a real password', async () => {
    const hash = await hasher.hash('CorrectHorseBattery42!');
    expect(hash).toMatch(/^\$argon2/);
    expect(await hasher.verify('CorrectHorseBattery42!', hash)).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hasher.hash('Right!Pass1');
    expect(await hasher.verify('Wrong!Pass1', hash)).toBe(false);
  });

  it('returns false for a malformed hash instead of throwing', async () => {
    expect(await hasher.verify('anything', 'not-a-real-argon2-hash')).toBe(false);
  });
});
