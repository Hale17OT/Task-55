import { describe, it, expect } from 'vitest';
import { validatePassword } from '../../src/core/domain/password-policy';

describe('validatePassword', () => {
  it('rejects password shorter than 12 characters', () => {
    const result = validatePassword('Short1!abc');
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.stringContaining('at least 12'));
  });

  it('rejects password without uppercase letter', () => {
    const result = validatePassword('alllowercase1!');
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.stringContaining('uppercase'));
  });

  it('rejects password without lowercase letter', () => {
    const result = validatePassword('ALLUPPERCASE1!');
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.stringContaining('lowercase'));
  });

  it('rejects password without digit', () => {
    const result = validatePassword('NoDigitsHere!@');
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.stringContaining('digit'));
  });

  it('rejects password without special character', () => {
    const result = validatePassword('NoSpecialChar1A');
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.stringContaining('special'));
  });

  it('accepts valid password with all required groups', () => {
    const result = validatePassword('ValidPass123!@');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('returns multiple errors for multiple violations', () => {
    const result = validatePassword('short');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(1);
  });

  it('accepts exactly 12 character password with all groups', () => {
    const result = validatePassword('Abcdefgh12!@');
    expect(result.valid).toBe(true);
  });
});
