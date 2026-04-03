import type { Role } from '@studioops/shared';

/**
 * Canonical list of all permissions in the system.
 * Used by the seed script to populate the permissions table.
 */
export const PERMISSIONS_MANIFEST: Array<{ resource: string; action: string }> = [
  // Offerings
  { resource: 'offering', action: 'create' },
  { resource: 'offering', action: 'read' },
  { resource: 'offering', action: 'update' },
  { resource: 'offering', action: 'delete' },
  // Portfolio
  { resource: 'portfolio', action: 'upload' },
  { resource: 'portfolio', action: 'read' },
  { resource: 'portfolio', action: 'update' },
  { resource: 'portfolio', action: 'delete' },
  // Events
  { resource: 'event', action: 'create' },
  { resource: 'event', action: 'read' },
  { resource: 'event', action: 'update' },
  { resource: 'event', action: 'delete' },
  // Registrations
  { resource: 'registration', action: 'create' },
  { resource: 'registration', action: 'read' },
  { resource: 'registration', action: 'update' },
  // Analytics
  { resource: 'analytics', action: 'view' },
  { resource: 'analytics', action: 'export' },
  // Dedup / Data Quality
  { resource: 'dedup', action: 'review' },
  { resource: 'dedup', action: 'merge' },
  { resource: 'data_quality', action: 'review' },
  { resource: 'data_quality', action: 'resolve' },
  // Users
  { resource: 'user', action: 'read' },
  { resource: 'user', action: 'update' },
  // Admin
  { resource: 'admin', action: 'manage_roles' },
  { resource: 'admin', action: 'manage_rules' },
  { resource: 'admin', action: 'manage_config' },
  { resource: 'admin', action: 'manage_sessions' },
  // Audit
  { resource: 'audit', action: 'read' },
];

/**
 * Default role→permission mappings.
 * Administrator gets everything (short-circuit in authorize, not listed here).
 */
export const ROLE_PERMISSIONS: Record<Exclude<Role, 'administrator'>, string[]> = {
  guest: [
    'offering:read',
  ],
  client: [
    'offering:read',
    'portfolio:read',
    'event:read',
    'registration:create',
    'registration:read',
    'user:read',
    'user:update',
  ],
  merchant: [
    'offering:create',
    'offering:read',
    'offering:update',
    'offering:delete',
    'portfolio:upload',
    'portfolio:read',
    'portfolio:update',
    'portfolio:delete',
    'event:create',
    'event:read',
    'event:update',
    'event:delete',
    'registration:create',
    'registration:read',
    'registration:update',
    'user:read',
    'user:update',
  ],
  operations: [
    'offering:read',
    'portfolio:read',
    'event:read',
    'registration:read',
    'registration:update',
    'analytics:view',
    'analytics:export',
    'dedup:review',
    'dedup:merge',
    'data_quality:review',
    'data_quality:resolve',
    'audit:read',
    'user:read',
  ],
};
