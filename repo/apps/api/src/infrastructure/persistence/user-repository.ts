import { eq } from 'drizzle-orm';
import { users } from '@studioops/db/schema';
import type { UserRepositoryPort, UserRecord, CreateUserInput } from '../../core/ports/user-repository.port';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
type Database = PostgresJsDatabase<any>;

export class DrizzleUserRepository implements UserRepositoryPort {
  constructor(private db: Database) {}

  async findByUsername(username: string): Promise<UserRecord | null> {
    const rows = await this.db.select().from(users).where(eq(users.username, username)).limit(1);
    return rows[0] ? this.toRecord(rows[0]) : null;
  }

  async findById(id: string): Promise<UserRecord | null> {
    const rows = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    return rows[0] ? this.toRecord(rows[0]) : null;
  }

  async create(input: CreateUserInput): Promise<UserRecord> {
    const [row] = await this.db
      .insert(users)
      .values({
        username: input.username,
        passwordHash: input.passwordHash,
        role: input.role,
      })
      .returning();
    return this.toRecord(row);
  }

  private toRecord(row: typeof users.$inferSelect): UserRecord {
    return {
      id: row.id,
      username: row.username,
      passwordHash: row.passwordHash,
      role: row.role,
      orgId: row.orgId,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
