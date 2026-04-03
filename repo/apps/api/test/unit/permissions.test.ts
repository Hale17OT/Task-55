import { describe, it, expect } from 'vitest';
import { ROLES } from '@studioops/shared';
import {
  formatPermission,
  parsePermission,
  isAdminRole,
  bypassesVisibility,
} from '../../src/core/domain/permissions';
import { PERMISSIONS_MANIFEST, ROLE_PERMISSIONS } from '../../src/core/domain/permissions-manifest';

describe('Role enum', () => {
  it('contains exactly 5 roles', () => {
    expect(ROLES).toHaveLength(5);
    expect(ROLES).toContain('guest');
    expect(ROLES).toContain('client');
    expect(ROLES).toContain('merchant');
    expect(ROLES).toContain('operations');
    expect(ROLES).toContain('administrator');
  });
});

describe('formatPermission', () => {
  it('formats resource:action', () => {
    expect(formatPermission('offering', 'create')).toBe('offering:create');
  });
});

describe('parsePermission', () => {
  it('parses valid permission string', () => {
    const result = parsePermission('offering:create');
    expect(result).toEqual({ resource: 'offering', action: 'create' });
  });

  it('returns null for invalid format', () => {
    expect(parsePermission('invalid')).toBeNull();
    expect(parsePermission('')).toBeNull();
    expect(parsePermission('a:b:c')).toBeNull();
  });
});

describe('isAdminRole', () => {
  it('returns true for administrator', () => {
    expect(isAdminRole('administrator')).toBe(true);
  });

  it('returns false for other roles', () => {
    expect(isAdminRole('merchant')).toBe(false);
    expect(isAdminRole('operations')).toBe(false);
    expect(isAdminRole('client')).toBe(false);
    expect(isAdminRole('guest')).toBe(false);
  });
});

describe('bypassesVisibility', () => {
  it('returns true for administrator and operations', () => {
    expect(bypassesVisibility('administrator')).toBe(true);
    expect(bypassesVisibility('operations')).toBe(true);
  });

  it('returns false for others', () => {
    expect(bypassesVisibility('merchant')).toBe(false);
    expect(bypassesVisibility('client')).toBe(false);
    expect(bypassesVisibility('guest')).toBe(false);
  });
});

describe('PERMISSIONS_MANIFEST', () => {
  it('has more than 20 permissions defined', () => {
    expect(PERMISSIONS_MANIFEST.length).toBeGreaterThan(20);
  });

  it('all entries have resource and action', () => {
    for (const entry of PERMISSIONS_MANIFEST) {
      expect(entry.resource).toBeTruthy();
      expect(entry.action).toBeTruthy();
    }
  });
});

describe('ROLE_PERMISSIONS', () => {
  it('has mappings for guest, client, merchant, operations', () => {
    expect(ROLE_PERMISSIONS.guest).toBeDefined();
    expect(ROLE_PERMISSIONS.client).toBeDefined();
    expect(ROLE_PERMISSIONS.merchant).toBeDefined();
    expect(ROLE_PERMISSIONS.operations).toBeDefined();
  });

  it('guest has minimal permissions', () => {
    expect(ROLE_PERMISSIONS.guest).toContain('offering:read');
    expect(ROLE_PERMISSIONS.guest).not.toContain('offering:create');
  });

  it('merchant has CRUD on offerings and portfolio', () => {
    expect(ROLE_PERMISSIONS.merchant).toContain('offering:create');
    expect(ROLE_PERMISSIONS.merchant).toContain('offering:update');
    expect(ROLE_PERMISSIONS.merchant).toContain('portfolio:upload');
  });

  it('operations has analytics and dedup but not offering create', () => {
    expect(ROLE_PERMISSIONS.operations).toContain('analytics:view');
    expect(ROLE_PERMISSIONS.operations).toContain('dedup:review');
    expect(ROLE_PERMISSIONS.operations).not.toContain('offering:create');
  });
});
