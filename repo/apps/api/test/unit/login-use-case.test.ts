import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LoginUseCase, AuthenticationError, LockoutError } from '../../src/core/use-cases/login';
import type { PasswordHasherPort } from '../../src/core/ports/password-hasher.port';
import type { UserRepositoryPort, UserRecord } from '../../src/core/ports/user-repository.port';
import type { SessionRepositoryPort } from '../../src/core/ports/session-repository.port';
import type { LockoutRepositoryPort } from '../../src/core/ports/lockout-repository.port';

function makeUser(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    id: 'user-1',
    username: 'testuser',
    passwordHash: 'hashed',
    role: 'client',
    orgId: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('LoginUseCase', () => {
  let userRepo: UserRepositoryPort;
  let passwordHasher: PasswordHasherPort;
  let sessionRepo: SessionRepositoryPort;
  let lockoutRepo: LockoutRepositoryPort;
  let useCase: LoginUseCase;

  beforeEach(() => {
    userRepo = {
      findByUsername: vi.fn().mockResolvedValue(makeUser()),
      findById: vi.fn().mockResolvedValue(makeUser()),
      create: vi.fn(),
    };
    passwordHasher = {
      hash: vi.fn(),
      verify: vi.fn().mockResolvedValue(true),
    };
    sessionRepo = {
      createSession: vi.fn().mockResolvedValue({ id: 'sess-1', userId: 'user-1', tokenJti: 'jti-1' }),
      createRefreshToken: vi.fn().mockResolvedValue({ id: 'rt-1' }),
      findRefreshTokenByHash: vi.fn(),
      markRefreshTokenUsed: vi.fn(),
      markRefreshTokenUsedAtomic: vi.fn().mockResolvedValue(false),
      revokeAllRefreshTokensForUser: vi.fn(),
      findSessionById: vi.fn(),
      updateSessionTokenJti: vi.fn(),
      updateSessionExpiry: vi.fn(),
    };
    lockoutRepo = {
      getActiveLockout: vi.fn().mockResolvedValue(null),
      getActiveLockoutByType: vi.fn().mockResolvedValue(null),
      recordFailedAttempt: vi.fn().mockResolvedValue(1),
      getRecentFailedAttemptCount: vi.fn().mockResolvedValue(1),
      createLockout: vi.fn(),
      clearFailedAttempts: vi.fn(),
    };
    useCase = new LoginUseCase(userRepo, passwordHasher, sessionRepo, lockoutRepo);
  });

  it('returns tokens on valid credentials', async () => {
    const result = await useCase.execute({ username: 'testuser', password: 'ValidPass123!@' });

    expect(result.accessTokenPayload.sub).toBe('user-1');
    expect(result.accessTokenPayload.role).toBe('client');
    expect(result.refreshToken).toBeTruthy();
    expect(result.expiresIn).toBe(1800);
  });

  it('returns error on invalid username', async () => {
    vi.mocked(userRepo.findByUsername).mockResolvedValue(null);

    await expect(
      useCase.execute({ username: 'nonexistent', password: 'ValidPass123!@' }),
    ).rejects.toThrow(AuthenticationError);
  });

  it('returns error on invalid password', async () => {
    vi.mocked(passwordHasher.verify).mockResolvedValue(false);

    await expect(
      useCase.execute({ username: 'testuser', password: 'WrongPass123!@' }),
    ).rejects.toThrow(AuthenticationError);
  });

  it('records failed attempt on wrong password', async () => {
    vi.mocked(passwordHasher.verify).mockResolvedValue(false);

    try {
      await useCase.execute({ username: 'testuser', password: 'WrongPass123!@' });
    } catch {}

    expect(lockoutRepo.recordFailedAttempt).toHaveBeenCalledWith('user-1');
  });

  it('locks account after 5 failures in 10 minutes', async () => {
    vi.mocked(passwordHasher.verify).mockResolvedValue(false);
    vi.mocked(lockoutRepo.getRecentFailedAttemptCount).mockResolvedValue(5);

    try {
      await useCase.execute({ username: 'testuser', password: 'WrongPass123!@' });
    } catch {}

    expect(lockoutRepo.createLockout).toHaveBeenCalledWith(
      'user-1',
      expect.any(Date),
      expect.stringContaining('5'),
    );
  });

  it('rejects login while account is locked', async () => {
    vi.mocked(lockoutRepo.getActiveLockoutByType).mockResolvedValue({
      id: 'lock-1',
      userId: 'user-1',
      restrictionType: 'lockout',
      reason: '5 failed attempts',
      expiresAt: new Date(Date.now() + 900_000), // 15 min from now
      failedAttempts: 5,
      failedWindowStart: new Date(),
    });

    await expect(
      useCase.execute({ username: 'testuser', password: 'ValidPass123!@' }),
    ).rejects.toThrow(LockoutError);
  });

  it('lockout error includes retry-after seconds', async () => {
    vi.mocked(lockoutRepo.getActiveLockoutByType).mockResolvedValue({
      id: 'lock-1',
      userId: 'user-1',
      restrictionType: 'lockout',
      reason: 'test',
      expiresAt: new Date(Date.now() + 600_000), // 10 min
      failedAttempts: 5,
      failedWindowStart: new Date(),
    });

    try {
      await useCase.execute({ username: 'testuser', password: 'ValidPass123!@' });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(LockoutError);
      expect((err as LockoutError).retryAfter).toBeGreaterThan(0);
      expect((err as LockoutError).retryAfter).toBeLessThanOrEqual(600);
    }
  });

  it('clears failed attempts on successful login', async () => {
    await useCase.execute({ username: 'testuser', password: 'ValidPass123!@' });

    expect(lockoutRepo.clearFailedAttempts).toHaveBeenCalledWith('user-1');
  });

  it('normalizes username to lowercase', async () => {
    await useCase.execute({ username: 'TestUser', password: 'ValidPass123!@' });

    expect(userRepo.findByUsername).toHaveBeenCalledWith('testuser');
  });

  it('creates session and refresh token', async () => {
    await useCase.execute({ username: 'testuser', password: 'ValidPass123!@' });

    expect(sessionRepo.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        tokenJti: expect.any(String),
      }),
    );
    expect(sessionRepo.createRefreshToken).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'sess-1',
        tokenHash: expect.any(String),
      }),
    );
  });
});
