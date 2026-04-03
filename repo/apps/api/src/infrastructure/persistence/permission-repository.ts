import { eq, and } from 'drizzle-orm';
import { permissions, rolePermissions, organizationMembers } from '@studioops/db/schema';
import type { PermissionRepositoryPort } from '../../core/ports/permission-repository.port';
import type { Role } from '@studioops/shared';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
type Database = PostgresJsDatabase<any>;

export class DrizzlePermissionRepository implements PermissionRepositoryPort {
  constructor(private db: Database) {}

  async getRolePermissions(role: Role): Promise<Set<string>> {
    const rows = await this.db
      .select({
        resource: permissions.resource,
        action: permissions.action,
      })
      .from(rolePermissions)
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(eq(rolePermissions.role, role));

    return new Set(rows.map((r) => `${r.resource}:${r.action}`));
  }

  async getOrgIdsForUser(userId: string): Promise<string[]> {
    const rows = await this.db
      .select({ orgId: organizationMembers.orgId })
      .from(organizationMembers)
      .where(eq(organizationMembers.userId, userId));

    return rows.map((r) => r.orgId);
  }
}
