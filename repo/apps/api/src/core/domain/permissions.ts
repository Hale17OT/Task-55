import type { Role } from '@studioops/shared';

export interface PermissionEntry {
  resource: string;
  action: string;
}

export function formatPermission(resource: string, action: string): string {
  return `${resource}:${action}`;
}

export function parsePermission(permission: string): PermissionEntry | null {
  const parts = permission.split(':');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return { resource: parts[0], action: parts[1] };
}

/**
 * Administrator always has access to everything.
 * This is a short-circuit check before consulting the DB.
 */
export function isAdminRole(role: Role): boolean {
  return role === 'administrator';
}

/**
 * Operations and Administrator roles bypass visibility restrictions
 * on offerings and portfolio items for auditing/analytics.
 */
export function bypassesVisibility(role: Role): boolean {
  return role === 'administrator' || role === 'operations';
}
