import type { Role } from '@studioops/shared';
import { isAdminRole, formatPermission } from '../domain/permissions';
import type { PermissionRepositoryPort } from '../ports/permission-repository.port';

export interface AuthContext {
  userId: string;
  role: Role;
  orgScope?: string[];
}

export interface PermissionCheckInput {
  authContext: AuthContext;
  resource: string;
  action: string;
  resourceOwnerId?: string;
  resourceOrgId?: string;
}

export class ForbiddenError extends Error {
  public readonly statusCode = 403;
  constructor(message: string = 'Insufficient permissions') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export class CheckPermissionUseCase {
  private cache = new Map<string, { permissions: Set<string>; expiresAt: number }>();
  private readonly CACHE_TTL_MS = 60_000; // 60 seconds

  constructor(private permissionRepo: PermissionRepositoryPort) {}

  async execute(input: PermissionCheckInput): Promise<void> {
    const { authContext, resource, action, resourceOwnerId, resourceOrgId } = input;

    // Administrator bypasses all permission checks
    if (isAdminRole(authContext.role)) {
      return;
    }

    // Check role has the permission
    const permissions = await this.getCachedPermissions(authContext.role);
    const required = formatPermission(resource, action);

    if (!permissions.has(required)) {
      throw new ForbiddenError('Insufficient permissions');
    }

    // Ownership check for Merchant
    if (authContext.role === 'merchant' && resourceOwnerId) {
      if (resourceOwnerId !== authContext.userId) {
        throw new ForbiddenError('You do not own this resource');
      }
    }

    // Org scope check for Operations
    if (authContext.role === 'operations' && resourceOrgId) {
      if (!authContext.orgScope || !authContext.orgScope.includes(resourceOrgId)) {
        throw new ForbiddenError('Resource outside your organization scope');
      }
    }

    // Org scope check for Merchant (can only act within own org)
    if (authContext.role === 'merchant' && resourceOrgId) {
      if (!authContext.orgScope || !authContext.orgScope.includes(resourceOrgId)) {
        throw new ForbiddenError('Resource outside your organization scope');
      }
    }
  }

  private async getCachedPermissions(role: Role): Promise<Set<string>> {
    const cached = this.cache.get(role);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.permissions;
    }

    const permissions = await this.permissionRepo.getRolePermissions(role);
    this.cache.set(role, {
      permissions,
      expiresAt: Date.now() + this.CACHE_TTL_MS,
    });
    return permissions;
  }

  clearCache(): void {
    this.cache.clear();
  }
}
