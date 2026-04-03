import { describe, it, expect } from 'vitest';
import { encrypt, decrypt, maskValue } from '../../src/core/domain/encryption';

const TEST_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

describe('AES-256-GCM encryption', () => {
  it('encrypts and decrypts round-trip', () => {
    const plaintext = 'my_secret_api_key_value';
    const encrypted = encrypt(plaintext, TEST_KEY);
    const decrypted = decrypt(encrypted, TEST_KEY);
    expect(decrypted).toBe(plaintext);
  });

  it('produces different ciphertext for same plaintext (random IV)', () => {
    const plaintext = 'same_input';
    const a = encrypt(plaintext, TEST_KEY);
    const b = encrypt(plaintext, TEST_KEY);
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(a.iv).not.toBe(b.iv);
  });

  it('fails with wrong key', () => {
    const plaintext = 'sensitive_data';
    const encrypted = encrypt(plaintext, TEST_KEY);
    const wrongKey = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
    expect(() => decrypt(encrypted, wrongKey)).toThrow();
  });

  it('fails with completely different ciphertext', () => {
    const encrypted = encrypt('my secret data here', TEST_KEY);
    // Use a completely different ciphertext value
    const fakeCiphertext = Buffer.from('completely_different_data_that_is_invalid').toString('base64');
    const tampered = { ...encrypted, ciphertext: fakeCiphertext };
    expect(() => decrypt(tampered, TEST_KEY)).toThrow();
  });

  it('fails with tampered auth tag', () => {
    const encrypted = encrypt('data', TEST_KEY);
    const tagBuf = Buffer.from(encrypted.authTag, 'base64');
    tagBuf[0] = tagBuf[0] ^ 0xff;
    const tampered = { ...encrypted, authTag: tagBuf.toString('base64') };
    expect(() => decrypt(tampered, TEST_KEY)).toThrow();
  });

  it('rejects key of wrong length', () => {
    expect(() => encrypt('data', 'tooshort')).toThrow('32 bytes');
  });

  it('produces base64 outputs', () => {
    const encrypted = encrypt('test', TEST_KEY);
    expect(encrypted.ciphertext.length).toBeGreaterThan(0);
    expect(encrypted.iv.length).toBeGreaterThan(0);
    expect(encrypted.authTag.length).toBeGreaterThan(0);
    // Verify they're valid base64
    expect(() => Buffer.from(encrypted.ciphertext, 'base64')).not.toThrow();
    expect(() => Buffer.from(encrypted.iv, 'base64')).not.toThrow();
    expect(() => Buffer.from(encrypted.authTag, 'base64')).not.toThrow();
  });
});

describe('maskValue', () => {
  it('masks long value showing last 4 chars', () => {
    expect(maskValue('my_secret_key_123')).toBe('****_123');
  });

  it('masks short value fully', () => {
    expect(maskValue('ab')).toBe('****');
    expect(maskValue('abcd')).toBe('****');
  });

  it('masks 5-char value', () => {
    expect(maskValue('12345')).toBe('****2345');
  });
});
