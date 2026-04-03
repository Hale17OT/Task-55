import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CheckPermissionUseCase, ForbiddenError } from '../../src/core/use-cases/check-permission';
import type { PermissionRepositoryPort } from '../../src/core/ports/permission-repository.port';

describe('CheckPermissionUseCase', () => {
  let permRepo: PermissionRepositoryPort;
  let useCase: CheckPermissionUseCase;

  const merchantPerms = new Set([
    'offering:create', 'offering:read', 'offering:update', 'offering:delete',
    'portfolio:upload', 'portfolio:read',
  ]);
  const opsPerms = new Set([
    'offering:read', 'analytics:view', 'analytics:export', 'dedup:review',
  ]);
  const clientPerms = new Set(['offering:read', 'portfolio:read']);
  const guestPerms = new Set(['offering:read']);

  beforeEach(() => {
    permRepo = {
      getRolePermissions: vi.fn().mockImplementation((role) => {
        const map: Record<string, Set<string>> = {
          merchant: merchantPerms,
          operations: opsPerms,
          client: clientPerms,
          guest: guestPerms,
        };
        return Promise.resolve(map[role] ?? new Set());
      }),
      getOrgIdsForUser: vi.fn().mockResolvedValue(['org-1']),
    };
    useCase = new CheckPermissionUseCase(permRepo);
  });

  it('allows Admin for any resource:action', async () => {
    await expect(
      useCase.execute({
        authContext: { userId: 'admin-1', role: 'administrator' },
        resource: 'offering',
        action: 'delete',
      }),
    ).resolves.toBeUndefined();

    // Admin doesn't even hit the repo
    expect(permRepo.getRolePermissions).not.toHaveBeenCalled();
  });

  it('allows Merchant for owned offering:update', async () => {
    await expect(
      useCase.execute({
        authContext: { userId: 'merchant-1', role: 'merchant', orgScope: ['org-1'] },
        resource: 'offering',
        action: 'update',
        resourceOwnerId: 'merchant-1',
        resourceOrgId: 'org-1',
      }),
    ).resolves.toBeUndefined();
  });

  it('denies Merchant for unowned offering:update', async () => {
    await expect(
      useCase.execute({
        authContext: { userId: 'merchant-1', role: 'merchant', orgScope: ['org-1'] },
        resource: 'offering',
        action: 'update',
        resourceOwnerId: 'merchant-2',
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('allows Operations for org-scoped resource', async () => {
    await expect(
      useCase.execute({
        authContext: { userId: 'ops-1', role: 'operations', orgScope: ['org-1', 'org-2'] },
        resource: 'offering',
        action: 'read',
        resourceOrgId: 'org-1',
      }),
    ).resolves.toBeUndefined();
  });

  it('denies Operations for out-of-scope org resource', async () => {
    await expect(
      useCase.execute({
        authContext: { userId: 'ops-1', role: 'operations', orgScope: ['org-1'] },
        resource: 'offering',
        action: 'read',
        resourceOrgId: 'org-999',
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('denies Client for offering:create', async () => {
    await expect(
      useCase.execute({
        authContext: { userId: 'client-1', role: 'client' },
        resource: 'offering',
        action: 'create',
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('denies Guest for offering:create', async () => {
    await expect(
      useCase.execute({
        authContext: { userId: 'guest-1', role: 'guest' },
        resource: 'offering',
        action: 'create',
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('allows Guest for offering:read', async () => {
    await expect(
      useCase.execute({
        authContext: { userId: 'guest-1', role: 'guest' },
        resource: 'offering',
        action: 'read',
      }),
    ).resolves.toBeUndefined();
  });

  it('caches permissions (second call does not hit repo)', async () => {
    await useCase.execute({
      authContext: { userId: 'c-1', role: 'client' },
      resource: 'offering',
      action: 'read',
    });
    await useCase.execute({
      authContext: { userId: 'c-2', role: 'client' },
      resource: 'offering',
      action: 'read',
    });

    expect(permRepo.getRolePermissions).toHaveBeenCalledTimes(1);
  });

  it('denies Merchant for out-of-org resource', async () => {
    await expect(
      useCase.execute({
        authContext: { userId: 'merchant-1', role: 'merchant', orgScope: ['org-1'] },
        resource: 'offering',
        action: 'create',
        resourceOrgId: 'org-2',
      }),
    ).rejects.toThrow(ForbiddenError);
  });
});
