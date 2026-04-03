import { randomUUID } from 'node:crypto';
import { SESSION } from '@studioops/shared';
import { hashRefreshToken, generateRefreshToken } from '../domain/refresh-token';
import type { SessionRepositoryPort } from '../ports/session-repository.port';
import { AuthenticationError } from './login';

export interface RefreshInput {
  refreshToken: string;
}

export interface RefreshResult {
  accessTokenPayload: { sub: string; role: string; jti: string };
  refreshToken: string;
  expiresIn: number;
}

export class RefreshUseCase {
  constructor(
    private sessionRepo: SessionRepositoryPort,
    private getUserRole: (userId: string) => Promise<string | null>,
  ) {}

  async execute(input: RefreshInput): Promise<RefreshResult> {
    const tokenHash = hashRefreshToken(input.refreshToken);
    const storedToken = await this.sessionRepo.findRefreshTokenByHash(tokenHash);

    if (!storedToken) {
      throw new AuthenticationError('Invalid or expired refresh token');
    }

    const now = new Date();

    if (storedToken.expiresAt < now) {
      throw new AuthenticationError('Invalid or expired refresh token');
    }

    if (storedToken.absoluteExpiresAt < now) {
      throw new AuthenticationError('Session expired, please log in again');
    }

    // Atomically mark token as used BEFORE any other state changes.
    // This closes the race window: concurrent requests both see used=false,
    // but only one can win the atomic UPDATE WHERE used=false.
    const wasAlreadyUsed = storedToken.used || await this.sessionRepo.markRefreshTokenUsedAtomic(storedToken.id);

    if (wasAlreadyUsed) {
      // Token reuse detected — possible replay attack. Revoke all sessions for this user.
      const session = await this.sessionRepo.findSessionById(storedToken.sessionId);
      if (session) {
        await this.sessionRepo.revokeAllRefreshTokensForUser(session.userId);
      }
      throw new AuthenticationError('Invalid or expired refresh token');
    }

    // Look up session to get userId
    const session = await this.sessionRepo.findSessionById(storedToken.sessionId);
    if (!session || session.revoked) {
      throw new AuthenticationError('Session revoked');
    }

    const role = await this.getUserRole(session.userId);
    if (!role) {
      throw new AuthenticationError('User not found');
    }

    // Issue new tokens with sliding session (8h window from now)
    const jti = randomUUID();
    const newRefreshTokenPair = generateRefreshToken();
    const refreshExpiresAt = new Date(now.getTime() + SESSION.REFRESH_TOKEN_LIFETIME_SECONDS * 1000);
    const slidingExpiry = new Date(now.getTime() + SESSION.ABSOLUTE_SESSION_LIFETIME_SECONDS * 1000);

    // Update session's tokenJti and extend sliding absoluteExpiresAt
    await this.sessionRepo.updateSessionExpiry(session.id, jti, slidingExpiry);

    await this.sessionRepo.createRefreshToken({
      sessionId: session.id,
      tokenHash: newRefreshTokenPair.hash,
      expiresAt: refreshExpiresAt,
      absoluteExpiresAt: slidingExpiry,
    });

    return {
      accessTokenPayload: { sub: session.userId, role, jti },
      refreshToken: newRefreshTokenPair.plaintext,
      expiresIn: SESSION.ACCESS_TOKEN_LIFETIME_SECONDS,
    };
  }
}
