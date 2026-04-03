import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RefreshUseCase } from '../../src/core/use-cases/refresh';
import { AuthenticationError } from '../../src/core/use-cases/login';
import type { SessionRepositoryPort, RefreshTokenRecord, SessionRecord } from '../../src/core/ports/session-repository.port';

function makeRefreshToken(overrides: Partial<RefreshTokenRecord> = {}): RefreshTokenRecord {
  return {
    id: 'rt-1',
    sessionId: 'sess-1',
    tokenHash: 'hash',
    expiresAt: new Date(Date.now() + 3600_000),
    absoluteExpiresAt: new Date(Date.now() + 86400_000),
    used: false,
    createdAt: new Date(),
    ...overrides,
  };
}

function makeSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: 'sess-1',
    userId: 'user-1',
    tokenJti: 'jti-1',
    issuedAt: new Date(),
    lastActivityAt: new Date(),
    absoluteExpiresAt: new Date(Date.now() + 86400_000),
    revoked: false,
    revokedBy: null,
    ...overrides,
  };
}

describe('RefreshUseCase', () => {
  let sessionRepo: SessionRepositoryPort;
  let getUserRole: ReturnType<typeof vi.fn>;
  let useCase: RefreshUseCase;

  beforeEach(() => {
    sessionRepo = {
      createSession: vi.fn(),
      createRefreshToken: vi.fn().mockResolvedValue({ id: 'rt-2' }),
      findRefreshTokenByHash: vi.fn().mockResolvedValue(makeRefreshToken()),
      markRefreshTokenUsed: vi.fn(),
      markRefreshTokenUsedAtomic: vi.fn().mockResolvedValue(false), // false = successfully claimed (not already used)
      revokeAllRefreshTokensForUser: vi.fn(),
      findSessionById: vi.fn().mockResolvedValue(makeSession()),
      updateSessionTokenJti: vi.fn(),
      updateSessionExpiry: vi.fn(),
    };
    getUserRole = vi.fn().mockResolvedValue('client');
    useCase = new RefreshUseCase(sessionRepo, getUserRole);
  });

  it('issues new token pair and revokes old', async () => {
    const result = await useCase.execute({ refreshToken: 'old-token' });

    expect(result.accessTokenPayload.sub).toBe('user-1');
    expect(result.refreshToken).toBeTruthy();
    expect(sessionRepo.markRefreshTokenUsedAtomic).toHaveBeenCalledWith('rt-1');
    expect(sessionRepo.createRefreshToken).toHaveBeenCalled();
  });

  it('rejects when token not found', async () => {
    vi.mocked(sessionRepo.findRefreshTokenByHash).mockResolvedValue(null);

    await expect(useCase.execute({ refreshToken: 'invalid' })).rejects.toThrow(AuthenticationError);
  });

  it('rejects and revokes all when token already used (replay attack)', async () => {
    vi.mocked(sessionRepo.findRefreshTokenByHash).mockResolvedValue(makeRefreshToken({ used: true }));

    await expect(useCase.execute({ refreshToken: 'reused' })).rejects.toThrow(AuthenticationError);
    expect(sessionRepo.revokeAllRefreshTokensForUser).toHaveBeenCalledWith('user-1');
  });

  it('rejects when atomic mark-as-used loses the race (concurrent refresh)', async () => {
    // Token appears unused in initial read, but atomic mark fails (another request claimed it)
    vi.mocked(sessionRepo.markRefreshTokenUsedAtomic).mockResolvedValue(true); // true = was already used

    await expect(useCase.execute({ refreshToken: 'raced' })).rejects.toThrow(AuthenticationError);
    expect(sessionRepo.revokeAllRefreshTokensForUser).toHaveBeenCalledWith('user-1');
  });

  it('rejects expired refresh token', async () => {
    vi.mocked(sessionRepo.findRefreshTokenByHash).mockResolvedValue(
      makeRefreshToken({ expiresAt: new Date(Date.now() - 1000) }),
    );

    await expect(useCase.execute({ refreshToken: 'expired' })).rejects.toThrow(AuthenticationError);
  });

  it('rejects when absolute session expired', async () => {
    vi.mocked(sessionRepo.findRefreshTokenByHash).mockResolvedValue(
      makeRefreshToken({ absoluteExpiresAt: new Date(Date.now() - 1000) }),
    );

    await expect(useCase.execute({ refreshToken: 'abs-expired' })).rejects.toThrow(AuthenticationError);
  });

  it('extends sliding session to now + 8h on refresh', async () => {
    const beforeRefresh = Date.now();
    await useCase.execute({ refreshToken: 'token' });

    // Verify session row is updated with new JTI AND sliding absoluteExpiresAt
    expect(sessionRepo.updateSessionExpiry).toHaveBeenCalledWith(
      'sess-1',
      expect.any(String),
      expect.any(Date),
    );

    // The session expiry should be ~8hr from now (sliding window)
    const [, , sessionExpiry] = vi.mocked(sessionRepo.updateSessionExpiry).mock.calls[0];
    expect(sessionExpiry.getTime()).toBeGreaterThanOrEqual(beforeRefresh + 28_800_000 - 1000);
    expect(sessionExpiry.getTime()).toBeLessThanOrEqual(beforeRefresh + 28_800_000 + 5000);
  });

  it('extends sliding session even for old sessions (not capped by issuedAt)', async () => {
    // Session issued 20 hours ago — well past 8h from issuedAt
    const issuedAt = new Date(Date.now() - 20 * 3600_000);
    vi.mocked(sessionRepo.findSessionById).mockResolvedValue(
      makeSession({ issuedAt }),
    );

    const beforeRefresh = Date.now();
    await useCase.execute({ refreshToken: 'token' });

    // Sliding: expiry should still be ~8h from now, NOT limited by issuedAt
    const [, , sessionExpiry] = vi.mocked(sessionRepo.updateSessionExpiry).mock.calls[0];
    expect(sessionExpiry.getTime()).toBeGreaterThanOrEqual(beforeRefresh + 28_800_000 - 1000);
    expect(sessionExpiry.getTime()).toBeLessThanOrEqual(beforeRefresh + 28_800_000 + 5000);
  });

  it('rejects when session is revoked', async () => {
    vi.mocked(sessionRepo.findSessionById).mockResolvedValue(makeSession({ revoked: true }));

    await expect(useCase.execute({ refreshToken: 'token' })).rejects.toThrow(AuthenticationError);
  });
});
