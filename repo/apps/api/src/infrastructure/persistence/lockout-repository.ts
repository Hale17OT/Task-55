import { eq, and, gt, sql } from 'drizzle-orm';
import { userRestrictions, loginAttempts } from '@studioops/db/schema';
import type { LockoutRepositoryPort, LockoutRecord } from '../../core/ports/lockout-repository.port';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
type Database = PostgresJsDatabase<any>;

export class DrizzleLockoutRepository implements LockoutRepositoryPort {
  constructor(private db: Database) {}

  async getActiveLockout(userId: string): Promise<LockoutRecord | null> {
    // Query for ANY active restriction (lockout or penalty)
    const rows = await this.db
      .select()
      .from(userRestrictions)
      .where(
        and(
          eq(userRestrictions.userId, userId),
          gt(userRestrictions.expiresAt, new Date()),
        ),
      )
      .limit(1);

    if (!rows[0]) return null;

    return this.toRecord(rows[0]);
  }

  async getActiveLockoutByType(userId: string, type: 'lockout' | 'penalty'): Promise<LockoutRecord | null> {
    const rows = await this.db
      .select()
      .from(userRestrictions)
      .where(
        and(
          eq(userRestrictions.userId, userId),
          eq(userRestrictions.restrictionType, type),
          gt(userRestrictions.expiresAt, new Date()),
        ),
      )
      .limit(1);

    if (!rows[0]) return null;

    return this.toRecord(rows[0]);
  }

  private toRecord(row: typeof userRestrictions.$inferSelect): LockoutRecord {
    return {
      id: row.id,
      userId: row.userId,
      restrictionType: row.restrictionType,
      reason: row.reason,
      expiresAt: row.expiresAt,
      failedAttempts: row.failedAttempts,
      failedWindowStart: row.failedWindowStart,
    };
  }

  async recordFailedAttempt(userId: string): Promise<number> {
    await this.db.insert(loginAttempts).values({ userId });
    return this.getRecentFailedAttemptCount(userId, 600); // 10 min
  }

  async getRecentFailedAttemptCount(userId: string, windowSeconds: number): Promise<number> {
    const windowStart = new Date(Date.now() - windowSeconds * 1000);
    const result = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(loginAttempts)
      .where(
        and(
          eq(loginAttempts.userId, userId),
          gt(loginAttempts.attemptedAt, windowStart),
        ),
      );
    return result[0]?.count ?? 0;
  }

  async createLockout(userId: string, expiresAt: Date, reason: string, type: 'lockout' | 'penalty' = 'lockout'): Promise<void> {
    await this.db.insert(userRestrictions).values({
      userId,
      restrictionType: type,
      reason,
      expiresAt,
    });
  }

  async clearFailedAttempts(userId: string): Promise<void> {
    await this.db.delete(loginAttempts).where(eq(loginAttempts.userId, userId));
  }
}
