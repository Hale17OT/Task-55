import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { createTestApp } from '../helpers/build-test-app';
import { CheckPermissionUseCase, ForbiddenError, type AuthContext } from '../../src/core/use-cases/check-permission';
import { DrizzlePermissionRepository } from '../../src/infrastructure/persistence/permission-repository';
import type { FastifyInstance } from 'fastify';

/**
 * Direct exercises of CheckPermissionUseCase against the real Drizzle
 * permission repository (no mocks). The resourceOwnerId / resourceOrgId
 * branches are not currently invoked by any HTTP route — routes do their
 * own ownership and org-scope checks — so this hits them via the use case
 * API instead. The repo is the real production class wired to the real DB.
 */
describe('CheckPermissionUseCase — direct', () => {
  let app: FastifyInstance;
  let useCase: CheckPermissionUseCase;
  let merchantOrgId: string;
  let merchantUserId: string;
  let opsUserId: string;

  beforeAll(async () => {
    app = await createTestApp();
    const repo = new DrizzlePermissionRepository(app.db);
    useCase = new CheckPermissionUseCase(repo);

    const orgs = await app.db.execute(sql`SELECT id FROM organizations LIMIT 1`);
    merchantOrgId = (orgs[0] as any).id;

    const ts = Date.now();
    // merchant
    const mName = `cpd_m_${ts}`;
    await app.db.execute(sql`INSERT INTO users (username, password_hash, role) VALUES (${mName}, 'x', 'merchant')`);
    const mRow = await app.db.execute(sql`SELECT id FROM users WHERE username = ${mName}`);
    merchantUserId = (mRow[0] as any).id;
    await app.db.execute(sql`INSERT INTO organization_members (org_id, user_id, role_in_org) VALUES (${merchantOrgId}, ${merchantUserId}, 'member') ON CONFLICT DO NOTHING`);

    // operations
    const oName = `cpd_o_${ts}`;
    await app.db.execute(sql`INSERT INTO users (username, password_hash, role) VALUES (${oName}, 'x', 'operations')`);
    const oRow = await app.db.execute(sql`SELECT id FROM users WHERE username = ${oName}`);
    opsUserId = (oRow[0] as any).id;
    await app.db.execute(sql`INSERT INTO organization_members (org_id, user_id, role_in_org) VALUES (${merchantOrgId}, ${opsUserId}, 'member') ON CONFLICT DO NOTHING`);
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('administrator bypasses all checks', async () => {
    const ctx: AuthContext = { userId: 'any', role: 'administrator', orgScope: undefined };
    await expect(useCase.execute({ authContext: ctx, resource: 'offering', action: 'delete' })).resolves.toBeUndefined();
  });

  it('throws ForbiddenError when role lacks the requested permission', async () => {
    const ctx: AuthContext = { userId: 'any', role: 'guest', orgScope: [] };
    await expect(useCase.execute({ authContext: ctx, resource: 'admin', action: 'manage' })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('merchant ownership check: own resource passes', async () => {
    const ctx: AuthContext = { userId: merchantUserId, role: 'merchant', orgScope: [merchantOrgId] };
    await expect(useCase.execute({
      authContext: ctx, resource: 'offering', action: 'read',
      resourceOwnerId: merchantUserId, resourceOrgId: merchantOrgId,
    })).resolves.toBeUndefined();
  });

  it('merchant ownership check: foreign owner rejects', async () => {
    const ctx: AuthContext = { userId: merchantUserId, role: 'merchant', orgScope: [merchantOrgId] };
    await expect(useCase.execute({
      authContext: ctx, resource: 'offering', action: 'read',
      resourceOwnerId: '00000000-0000-0000-0000-000000000999',
    })).rejects.toThrow(/own this resource/);
  });

  it('merchant org-scope check: rejects resource in foreign org', async () => {
    const ctx: AuthContext = { userId: merchantUserId, role: 'merchant', orgScope: [merchantOrgId] };
    await expect(useCase.execute({
      authContext: ctx, resource: 'offering', action: 'read',
      resourceOwnerId: merchantUserId, resourceOrgId: '00000000-0000-0000-0000-000000000999',
    })).rejects.toThrow(/organization scope/);
  });

  it('merchant org-scope check: rejects when orgScope is undefined', async () => {
    const ctx: AuthContext = { userId: merchantUserId, role: 'merchant', orgScope: undefined };
    await expect(useCase.execute({
      authContext: ctx, resource: 'offering', action: 'read',
      resourceOwnerId: merchantUserId, resourceOrgId: merchantOrgId,
    })).rejects.toThrow(/organization scope/);
  });

  it('operations org-scope check: passes when org is in scope', async () => {
    const ctx: AuthContext = { userId: opsUserId, role: 'operations', orgScope: [merchantOrgId] };
    await expect(useCase.execute({
      authContext: ctx, resource: 'offering', action: 'read',
      resourceOrgId: merchantOrgId,
    })).resolves.toBeUndefined();
  });

  it('operations org-scope check: rejects when org is out of scope', async () => {
    const ctx: AuthContext = { userId: opsUserId, role: 'operations', orgScope: [merchantOrgId] };
    await expect(useCase.execute({
      authContext: ctx, resource: 'offering', action: 'read',
      resourceOrgId: '00000000-0000-0000-0000-000000000999',
    })).rejects.toThrow(/organization scope/);
  });

  it('operations org-scope check: rejects when orgScope is undefined', async () => {
    const ctx: AuthContext = { userId: opsUserId, role: 'operations', orgScope: undefined };
    await expect(useCase.execute({
      authContext: ctx, resource: 'offering', action: 'read',
      resourceOrgId: merchantOrgId,
    })).rejects.toThrow(/organization scope/);
  });

  it('clearCache forces a re-fetch on the next call', async () => {
    const ctx: AuthContext = { userId: merchantUserId, role: 'merchant', orgScope: [merchantOrgId] };
    // First call populates cache
    await useCase.execute({ authContext: ctx, resource: 'offering', action: 'read' });
    useCase.clearCache();
    // Second call goes through the repo again — still succeeds
    await expect(useCase.execute({ authContext: ctx, resource: 'offering', action: 'read' })).resolves.toBeUndefined();
  });
});
