import type { Role } from '@studioops/shared';

export interface PermissionRepositoryPort {
  getRolePermissions(role: Role): Promise<Set<string>>;
  getOrgIdsForUser(userId: string): Promise<string[]>;
}
