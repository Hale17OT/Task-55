export interface RefreshTokenRecord {
  id: string;
  sessionId: string;
  tokenHash: string;
  expiresAt: Date;
  absoluteExpiresAt: Date;
  used: boolean;
  createdAt: Date;
}

export interface SessionRecord {
  id: string;
  userId: string;
  tokenJti: string;
  issuedAt: Date;
  lastActivityAt: Date;
  absoluteExpiresAt: Date;
  revoked: boolean;
  revokedBy: string | null;
}

export interface CreateSessionInput {
  userId: string;
  tokenJti: string;
  absoluteExpiresAt: Date;
}

export interface CreateRefreshTokenInput {
  sessionId: string;
  tokenHash: string;
  expiresAt: Date;
  absoluteExpiresAt: Date;
}

export interface SessionRepositoryPort {
  createSession(input: CreateSessionInput): Promise<SessionRecord>;
  createRefreshToken(input: CreateRefreshTokenInput): Promise<RefreshTokenRecord>;
  findRefreshTokenByHash(hash: string): Promise<RefreshTokenRecord | null>;
  markRefreshTokenUsed(id: string): Promise<void>;
  /** Atomically mark token as used; returns true if it was already used (replay). */
  markRefreshTokenUsedAtomic(id: string): Promise<boolean>;
  revokeAllRefreshTokensForUser(userId: string): Promise<number>;
  findSessionById(id: string): Promise<SessionRecord | null>;
  updateSessionTokenJti(sessionId: string, newJti: string): Promise<void>;
  updateSessionExpiry(sessionId: string, newJti: string, absoluteExpiresAt: Date): Promise<void>;
}
