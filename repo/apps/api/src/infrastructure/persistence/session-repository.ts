import { eq, and, sql } from 'drizzle-orm';
import { sessions, refreshTokens } from '@studioops/db/schema';
import type {
  SessionRepositoryPort,
  SessionRecord,
  RefreshTokenRecord,
  CreateSessionInput,
  CreateRefreshTokenInput,
} from '../../core/ports/session-repository.port';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
type Database = PostgresJsDatabase<any>;

export class DrizzleSessionRepository implements SessionRepositoryPort {
  constructor(private db: Database) {}

  async createSession(input: CreateSessionInput): Promise<SessionRecord> {
    const [row] = await this.db
      .insert(sessions)
      .values({
        userId: input.userId,
        tokenJti: input.tokenJti,
        absoluteExpiresAt: input.absoluteExpiresAt,
      })
      .returning();
    return this.toSessionRecord(row);
  }

  async createRefreshToken(input: CreateRefreshTokenInput): Promise<RefreshTokenRecord> {
    const [row] = await this.db
      .insert(refreshTokens)
      .values({
        sessionId: input.sessionId,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
        absoluteExpiresAt: input.absoluteExpiresAt,
      })
      .returning();
    return this.toRefreshTokenRecord(row);
  }

  async findRefreshTokenByHash(hash: string): Promise<RefreshTokenRecord | null> {
    const rows = await this.db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, hash))
      .limit(1);
    return rows[0] ? this.toRefreshTokenRecord(rows[0]) : null;
  }

  async markRefreshTokenUsed(id: string): Promise<void> {
    await this.db.update(refreshTokens).set({ used: true }).where(eq(refreshTokens.id, id));
  }

  async markRefreshTokenUsedAtomic(id: string): Promise<boolean> {
    // Atomically set used=true only if currently unused; returns true if already used (replay)
    const rows = await this.db.update(refreshTokens)
      .set({ used: true })
      .where(and(eq(refreshTokens.id, id), eq(refreshTokens.used, false)))
      .returning({ id: refreshTokens.id });
    // If no rows updated, the token was already used
    return rows.length === 0;
  }

  async revokeAllRefreshTokensForUser(userId: string): Promise<number> {
    // Find all sessions for user, then mark all their refresh tokens as used
    const userSessions = await this.db
      .select({ id: sessions.id })
      .from(sessions)
      .where(eq(sessions.userId, userId));

    if (userSessions.length === 0) return 0;

    const sessionIds = userSessions.map((s) => s.id);

    let count = 0;
    for (const sid of sessionIds) {
      const rows = await this.db
        .update(refreshTokens)
        .set({ used: true })
        .where(and(eq(refreshTokens.sessionId, sid), eq(refreshTokens.used, false)))
        .returning({ id: refreshTokens.id });
      count += rows.length;
    }

    // Also revoke all sessions
    await this.db
      .update(sessions)
      .set({ revoked: true })
      .where(eq(sessions.userId, userId));

    return count;
  }

  async findSessionById(id: string): Promise<SessionRecord | null> {
    const rows = await this.db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
    return rows[0] ? this.toSessionRecord(rows[0]) : null;
  }

  async updateSessionTokenJti(sessionId: string, newJti: string): Promise<void> {
    await this.db.update(sessions).set({ tokenJti: newJti }).where(eq(sessions.id, sessionId));
  }

  async updateSessionExpiry(sessionId: string, newJti: string, absoluteExpiresAt: Date): Promise<void> {
    await this.db.update(sessions).set({
      tokenJti: newJti,
      absoluteExpiresAt,
      lastActivityAt: new Date(),
    }).where(eq(sessions.id, sessionId));
  }

  private toSessionRecord(row: typeof sessions.$inferSelect): SessionRecord {
    return {
      id: row.id,
      userId: row.userId,
      tokenJti: row.tokenJti,
      issuedAt: row.issuedAt,
      lastActivityAt: row.lastActivityAt,
      absoluteExpiresAt: row.absoluteExpiresAt,
      revoked: row.revoked,
      revokedBy: row.revokedBy,
    };
  }

  private toRefreshTokenRecord(row: typeof refreshTokens.$inferSelect): RefreshTokenRecord {
    return {
      id: row.id,
      sessionId: row.sessionId,
      tokenHash: row.tokenHash,
      expiresAt: row.expiresAt,
      absoluteExpiresAt: row.absoluteExpiresAt,
      used: row.used,
      createdAt: row.createdAt,
    };
  }
}
