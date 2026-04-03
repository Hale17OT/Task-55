import { randomUUID } from 'node:crypto';
import { LOCKOUT, SESSION } from '@studioops/shared';
import { generateRefreshToken } from '../domain/refresh-token';
import type { PasswordHasherPort } from '../ports/password-hasher.port';
import type { UserRepositoryPort } from '../ports/user-repository.port';
import type { SessionRepositoryPort } from '../ports/session-repository.port';
import type { LockoutRepositoryPort } from '../ports/lockout-repository.port';

export interface LoginInput {
  username: string;
  password: string;
}

export interface LoginResult {
  accessTokenPayload: { sub: string; role: string; jti: string };
  refreshToken: string;
  expiresIn: number;
}

export class AuthenticationError extends Error {
  public readonly statusCode = 401;
  constructor(message: string = 'Invalid credentials') {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class LockoutError extends Error {
  public readonly statusCode = 429;
  public readonly retryAfter: number;

  constructor(retryAfterSeconds: number) {
    super('Account temporarily locked');
    this.name = 'LockoutError';
    this.retryAfter = retryAfterSeconds;
  }
}

export class LoginUseCase {
  constructor(
    private userRepo: UserRepositoryPort,
    private passwordHasher: PasswordHasherPort,
    private sessionRepo: SessionRepositoryPort,
    private lockoutRepo: LockoutRepositoryPort,
  ) {}

  async execute(input: LoginInput): Promise<LoginResult> {
    const username = input.username.trim().toLowerCase();

    const user = await this.userRepo.findByUsername(username);
    if (!user) {
      throw new AuthenticationError();
    }

    // Check active lockout (only auth lockouts, not quota penalties)
    const lockout = await this.lockoutRepo.getActiveLockoutByType(user.id, 'lockout');
    if (lockout && lockout.expiresAt && lockout.expiresAt > new Date()) {
      const retryAfter = Math.ceil((lockout.expiresAt.getTime() - Date.now()) / 1000);
      throw new LockoutError(retryAfter);
    }

    // Verify password
    const isValid = await this.passwordHasher.verify(input.password, user.passwordHash);
    if (!isValid) {
      await this.lockoutRepo.recordFailedAttempt(user.id);
      const recentCount = await this.lockoutRepo.getRecentFailedAttemptCount(
        user.id,
        LOCKOUT.WINDOW_SECONDS,
      );

      if (recentCount >= LOCKOUT.MAX_ATTEMPTS) {
        const expiresAt = new Date(Date.now() + LOCKOUT.DURATION_SECONDS * 1000);
        await this.lockoutRepo.createLockout(
          user.id,
          expiresAt,
          `${LOCKOUT.MAX_ATTEMPTS} failed login attempts`,
        );
      }

      throw new AuthenticationError();
    }

    // Clear failed attempts on success
    await this.lockoutRepo.clearFailedAttempts(user.id);

    // Create session
    const jti = randomUUID();
    const now = new Date();
    const absoluteExpiresAt = new Date(now.getTime() + SESSION.ABSOLUTE_SESSION_LIFETIME_SECONDS * 1000);

    const session = await this.sessionRepo.createSession({
      userId: user.id,
      tokenJti: jti,
      absoluteExpiresAt,
    });

    // Create refresh token
    const refreshTokenPair = generateRefreshToken();
    const refreshExpiresAt = new Date(now.getTime() + SESSION.REFRESH_TOKEN_LIFETIME_SECONDS * 1000);

    await this.sessionRepo.createRefreshToken({
      sessionId: session.id,
      tokenHash: refreshTokenPair.hash,
      expiresAt: refreshExpiresAt,
      absoluteExpiresAt,
    });

    return {
      accessTokenPayload: { sub: user.id, role: user.role, jti },
      refreshToken: refreshTokenPair.plaintext,
      expiresIn: SESSION.ACCESS_TOKEN_LIFETIME_SECONDS,
    };
  }
}
