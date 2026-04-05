import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, desc, count, gte, lte, sql } from 'drizzle-orm';
import {
  permissions, rolePermissions, rules, sessions, refreshTokens,
  auditLogs, configEntries, ruleWhitelist, organizationMembers, organizations, users,
} from '@studioops/db/schema';
import {
  createRuleSchema, updateRuleSchema,
  updateConfigSchema, revealConfigSchema,
  updateRolePermissionsSchema,
} from '@studioops/shared';
import { encrypt, decrypt, maskValue } from '../../core/domain/encryption';
import { Argon2Hasher } from '../../infrastructure/crypto/argon2-hasher';
import { DrizzleUserRepository } from '../../infrastructure/persistence/user-repository';
import type { Role } from '@studioops/shared';

export default async function adminRoutes(fastify: FastifyInstance) {
  const encryptionKey = fastify.appConfig?.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY || '';
  const hasher = new Argon2Hasher();
  const userRepo = new DrizzleUserRepository(fastify.db);

  // All admin routes require authentication (with session validation) + Administrator role
  fastify.addHook('preHandler', async (request, reply) => {
    // Use fastify.authenticate which validates JWT + checks session revocation/expiry
    await fastify.authenticate(request, reply);
    if (reply.sent) return; // authenticate already sent 401
    // Then check admin role
    if (request.user?.role !== 'administrator') {
      return reply.status(403).send({ error: 'FORBIDDEN', message: 'Administrator access required' });
    }
  });

  // ==================== ROLES ====================

  // GET /admin/roles
  fastify.get('/roles', async (_request, reply) => {
    const allPerms = await fastify.db.select().from(permissions);
    const allMappings = await fastify.db.select().from(rolePermissions);

    const rolesData: Record<string, string[]> = {};
    for (const mapping of allMappings) {
      const perm = allPerms.find(p => p.id === mapping.permissionId);
      if (!perm) continue;
      const key = `${perm.resource}:${perm.action}`;
      if (!rolesData[mapping.role]) rolesData[mapping.role] = [];
      rolesData[mapping.role].push(key);
    }

    return reply.status(200).send({
      data: Object.entries(rolesData).map(([role, perms]) => ({ role, permissions: perms })),
      allPermissions: allPerms.map(p => `${p.resource}:${p.action}`),
    });
  });

  // PUT /admin/roles/:roleId/permissions
  fastify.put('/roles/:roleId/permissions', async (request, reply) => {
    const { roleId } = request.params as { roleId: string };
    const parseResult = updateRolePermissionsSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', message: 'Validation failed', details: parseResult.error.issues.map(i => i.message) });
    }

    const role = roleId as Role;
    if (!['guest', 'client', 'merchant', 'operations'].includes(role)) {
      return reply.status(422).send({ error: 'INVALID_ROLE', message: 'Cannot modify administrator permissions directly' });
    }

    // Validate all permission names exist
    const allPerms = await fastify.db.select().from(permissions);
    const permMap = new Map(allPerms.map(p => [`${p.resource}:${p.action}`, p.id]));

    const unknownPerms = parseResult.data.permissions.filter(p => !permMap.has(p));
    if (unknownPerms.length > 0) {
      return reply.status(422).send({ error: 'UNKNOWN_PERMISSION', message: 'Unknown permissions', unknownPermissions: unknownPerms });
    }

    // Replace role permissions
    await fastify.db.delete(rolePermissions).where(eq(rolePermissions.role, role));

    if (parseResult.data.permissions.length > 0) {
      await fastify.db.insert(rolePermissions).values(
        parseResult.data.permissions.map(p => ({
          role,
          permissionId: permMap.get(p)!,
        })),
      );
    }

    request.auditContext = { resourceType: 'role_permissions', resourceId: role, afterState: { permissions: parseResult.data.permissions } };
    await request.writeAudit();

    return reply.status(200).send({ role, permissions: parseResult.data.permissions });
  });

  // ==================== RULES ====================

  // GET /admin/rules
  fastify.get('/rules', async (request, reply) => {
    const query = request.query as { page?: string; limit?: string; ruleKey?: string; status?: string };
    const page = Math.max(1, parseInt(query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || '20', 10)));
    const offset = (page - 1) * limit;

    const conditions: any[] = [];
    if (query.ruleKey) conditions.push(eq(rules.ruleKey, query.ruleKey));
    if (query.status) conditions.push(eq(rules.status, query.status as any));

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const [totalResult] = await fastify.db.select({ count: count() }).from(rules).where(where);
    const total = totalResult?.count ?? 0;

    const rows = await fastify.db.select().from(rules)
      .where(where)
      .orderBy(desc(rules.createdAt))
      .limit(limit)
      .offset(offset);

    return reply.status(200).send({
      data: rows,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  });

  // POST /admin/rules
  fastify.post('/rules', async (request, reply) => {
    const parseResult = createRuleSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', message: 'Validation failed', details: parseResult.error.issues.map(i => i.message) });
    }

    const { effectiveFrom, effectiveTo, ...rest } = parseResult.data;
    const fromDate = new Date(effectiveFrom);
    const toDate = effectiveTo ? new Date(effectiveTo) : null;

    if (toDate && fromDate >= toDate) {
      return reply.status(422).send({ error: 'INVALID_DATE_RANGE', message: 'effectiveFrom must be before effectiveTo' });
    }

    if (rest.canaryPercent < 0 || rest.canaryPercent > 100) {
      return reply.status(422).send({ error: 'INVALID_CANARY_PERCENT', message: 'canaryPercent must be 0-100' });
    }

    // Determine next version for this rule_key
    const existing = await fastify.db.select({ version: rules.version })
      .from(rules)
      .where(eq(rules.ruleKey, rest.ruleKey))
      .orderBy(desc(rules.version))
      .limit(1);

    const nextVersion = (existing[0]?.version ?? 0) + 1;

    const [row] = await fastify.db.insert(rules).values({
      ruleKey: rest.ruleKey,
      version: nextVersion,
      config: rest.config,
      effectiveFrom: fromDate,
      effectiveTo: toDate,
      canaryPercent: rest.canaryPercent,
      status: 'active',
      createdBy: request.user.sub,
    }).returning();

    request.auditContext = { resourceType: 'rule', resourceId: row.id, afterState: row };
    await request.writeAudit();
    return reply.status(201).send(row);
  });

  // PUT /admin/rules/:id
  fastify.put('/rules/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parseResult = updateRuleSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', message: 'Validation failed', details: parseResult.error.issues.map(i => i.message) });
    }

    const existing = await fastify.db.select().from(rules).where(eq(rules.id, id)).limit(1);
    if (!existing[0]) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Rule not found' });

    const updateData: any = {};
    if (parseResult.data.config) updateData.config = parseResult.data.config;
    if (parseResult.data.effectiveFrom) updateData.effectiveFrom = new Date(parseResult.data.effectiveFrom);
    if (parseResult.data.effectiveTo !== undefined) updateData.effectiveTo = parseResult.data.effectiveTo ? new Date(parseResult.data.effectiveTo) : null;
    if (parseResult.data.canaryPercent !== undefined) updateData.canaryPercent = parseResult.data.canaryPercent;
    if (parseResult.data.description !== undefined) updateData.description = parseResult.data.description;

    const [row] = await fastify.db.update(rules).set(updateData).where(eq(rules.id, id)).returning();
    request.auditContext = { resourceType: 'rule', resourceId: id, beforeState: existing[0], afterState: row };
    await request.writeAudit();
    return reply.status(200).send(row);
  });

  // DELETE /admin/rules/:id (soft-delete via status = deprecated)
  fastify.delete('/rules/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await fastify.db.select().from(rules).where(eq(rules.id, id)).limit(1);
    if (!existing[0]) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Rule not found' });

    await fastify.db.update(rules).set({ status: 'deprecated' }).where(eq(rules.id, id));
    request.auditContext = { resourceType: 'rule', resourceId: id, beforeState: existing[0] };
    await request.writeAudit();
    return reply.status(204).send();
  });

  // ==================== AUDIT ====================

  // GET /admin/audit
  fastify.get('/audit', async (request, reply) => {
    const query = request.query as {
      page?: string; limit?: string; actor?: string;
      resourceType?: string; resourceId?: string;
      from?: string; to?: string;
    };
    const page = Math.max(1, parseInt(query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || '50', 10)));
    const offset = (page - 1) * limit;

    const conditions: any[] = [];
    if (query.actor) conditions.push(eq(auditLogs.actorId, query.actor));
    if (query.resourceType) conditions.push(eq(auditLogs.resourceType, query.resourceType));
    if (query.resourceId) conditions.push(eq(auditLogs.resourceId, query.resourceId));
    if (query.from) conditions.push(gte(auditLogs.createdAt, new Date(query.from)));
    if (query.to) conditions.push(lte(auditLogs.createdAt, new Date(query.to)));

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const [totalResult] = await fastify.db.select({ count: count() }).from(auditLogs).where(where);
    const total = totalResult?.count ?? 0;

    const rows = await fastify.db.select().from(auditLogs)
      .where(where)
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit)
      .offset(offset);

    return reply.status(200).send({
      data: rows,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  });

  // ==================== CONFIG ====================

  // GET /admin/config
  fastify.get('/config', async (_request, reply) => {
    const entries = await fastify.db.select().from(configEntries);

    const masked = entries.map(entry => ({
      key: entry.key,
      displayValue: entry.isEncrypted && entry.encryptedValue
        ? maskValue(entry.encryptedValue)
        : entry.encryptedValue || '',
      isEncrypted: entry.isEncrypted,
      updatedBy: entry.updatedBy,
      updatedAt: entry.updatedAt,
    }));

    return reply.status(200).send({ data: masked });
  });

  // PUT /admin/config/:key
  fastify.put('/config/:key', async (request, reply) => {
    const { key } = request.params as { key: string };
    const parseResult = updateConfigSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', message: 'Validation failed', details: parseResult.error.issues.map(i => i.message) });
    }

    // Default to encrypted storage. Only explicitly allowlisted non-sensitive keys may be plaintext.
    const NON_SENSITIVE_KEYS = new Set([
      'STUDIO_NAME', 'LOGO_URL', 'TIMEZONE', 'LOCALE', 'BUSINESS_HOURS',
      'DEFAULT_CURRENCY', 'DATE_FORMAT', 'COMPANY_ADDRESS',
    ]);
    const isEncrypted = parseResult.data.isEncrypted !== false || !NON_SENSITIVE_KEYS.has(key);

    if (!isEncrypted && !NON_SENSITIVE_KEYS.has(key)) {
      return reply.status(422).send({
        error: 'ENCRYPTION_REQUIRED',
        message: `Config key "${key}" must be stored encrypted. Only allowlisted non-sensitive keys (${[...NON_SENSITIVE_KEYS].join(', ')}) may be plaintext.`,
      });
    }

    let storedValue = parseResult.data.value;
    let iv: string | null = null;
    let authTag: string | null = null;

    if (isEncrypted) {
      const encrypted = encrypt(parseResult.data.value, encryptionKey);
      storedValue = encrypted.ciphertext;
      iv = encrypted.iv;
      authTag = encrypted.authTag;
    }

    // Upsert
    const existing = await fastify.db.select().from(configEntries).where(eq(configEntries.key, key)).limit(1);

    if (existing.length > 0) {
      await fastify.db.update(configEntries).set({
        encryptedValue: storedValue,
        iv,
        authTag,
        isEncrypted,
        updatedBy: request.user.sub,
        updatedAt: new Date(),
      }).where(eq(configEntries.key, key));
    } else {
      await fastify.db.insert(configEntries).values({
        key,
        encryptedValue: storedValue,
        iv,
        authTag,
        isEncrypted,
        updatedBy: request.user.sub,
      });
    }

    request.auditContext = { resourceType: 'config', resourceId: key };
    await request.writeAudit();
    return reply.status(200).send({ key, isEncrypted });
  });

  // POST /admin/config/:key/reveal
  fastify.post('/config/:key/reveal', async (request, reply) => {
    const { key } = request.params as { key: string };
    const parseResult = revealConfigSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', message: 'Validation failed', details: parseResult.error.issues.map(i => i.message) });
    }

    // Re-authenticate: verify password
    const user = await userRepo.findById(request.user.sub);
    if (!user) {
      return reply.status(401).send({ error: 'UNAUTHORIZED', message: 'User not found' });
    }

    const isValid = await hasher.verify(parseResult.data.password, user.passwordHash);
    if (!isValid) {
      return reply.status(403).send({ error: 'REAUTH_FAILED', message: 'Incorrect password' });
    }

    const entry = await fastify.db.select().from(configEntries).where(eq(configEntries.key, key)).limit(1);
    if (!entry[0]) {
      return reply.status(404).send({ error: 'CONFIG_KEY_NOT_FOUND', message: 'Config key not found' });
    }

    if (!entry[0].isEncrypted) {
      return reply.status(422).send({ error: 'NOT_ENCRYPTED', message: 'Config entry is not encrypted' });
    }

    try {
      const decrypted = decrypt(
        { ciphertext: entry[0].encryptedValue!, iv: entry[0].iv!, authTag: entry[0].authTag! },
        encryptionKey,
      );

      request.auditContext = { resourceType: 'config', resourceId: key, action: 'config_reveal' };
      await request.writeAudit();
      return reply.status(200).send({ key, value: decrypted });
    } catch (err) {
      request.log.error({ err, key }, 'Config decryption failed');
      return reply.status(500).send({ error: 'DECRYPTION_ERROR', message: 'Failed to decrypt config value' });
    }
  });

  // ==================== SESSIONS ====================

  // GET /admin/sessions
  fastify.get('/sessions', async (request, reply) => {
    const query = request.query as { page?: string; limit?: string; userId?: string };
    const page = Math.max(1, parseInt(query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || '50', 10)));
    const offset = (page - 1) * limit;

    const conditions: any[] = [eq(sessions.revoked, false)];
    if (query.userId) conditions.push(eq(sessions.userId, query.userId));

    const where = and(...conditions);
    const [totalResult] = await fastify.db.select({ count: count() }).from(sessions).where(where);
    const total = totalResult?.count ?? 0;

    const rows = await fastify.db.select().from(sessions)
      .where(where)
      .orderBy(desc(sessions.lastActivityAt))
      .limit(limit)
      .offset(offset);

    return reply.status(200).send({
      data: rows,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  });

  // DELETE /admin/sessions/:sessionId
  fastify.delete('/sessions/:sessionId', async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };

    // Validate UUID format to prevent DB errors
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidPattern.test(sessionId)) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', message: 'Invalid session ID format' });
    }

    const existing = await fastify.db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
    if (!existing[0]) {
      return reply.status(404).send({ error: 'SESSION_NOT_FOUND', message: 'Session not found' });
    }

    // Revoke session
    await fastify.db.update(sessions).set({
      revoked: true,
      revokedBy: request.user.sub,
    }).where(eq(sessions.id, sessionId));

    // Revoke all refresh tokens for this session
    await fastify.db.update(refreshTokens).set({ used: true })
      .where(eq(refreshTokens.sessionId, sessionId));

    request.auditContext = { resourceType: 'session', resourceId: sessionId, action: 'session_revoked' };
    await request.writeAudit();
    return reply.status(204).send();
  });

  // ==================== RULE WHITELIST ====================

  // GET /admin/whitelist
  fastify.get('/whitelist', async (request, reply) => {
    const query = request.query as { ruleKey?: string; page?: string; limit?: string };
    const page = Math.max(1, parseInt(query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || '20', 10)));
    const offset = (page - 1) * limit;

    const conditions: any[] = [];
    if (query.ruleKey) conditions.push(eq(ruleWhitelist.ruleKey, query.ruleKey));
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalResult] = await fastify.db.select({ count: count() }).from(ruleWhitelist).where(where);
    const total = totalResult?.count ?? 0;

    const rows = await fastify.db.select().from(ruleWhitelist)
      .where(where)
      .orderBy(desc(ruleWhitelist.createdAt))
      .limit(limit)
      .offset(offset);

    return reply.status(200).send({
      data: rows,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  });

  // POST /admin/whitelist
  fastify.post('/whitelist', async (request, reply) => {
    const whitelistSchema = z.object({ ruleKey: z.string().min(1), userId: z.string().uuid() });
    const parseResult = whitelistSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', message: 'Validation failed', details: parseResult.error.issues.map(i => i.message) });
    }
    const body = parseResult.data;

    try {
      const [row] = await fastify.db.insert(ruleWhitelist).values({
        ruleKey: body.ruleKey,
        userId: body.userId,
        grantedBy: request.user.sub,
      }).returning();

      request.auditContext = { resourceType: 'rule_whitelist', resourceId: row.id, action: 'whitelist_grant', afterState: row };
      await request.writeAudit();
      return reply.status(201).send(row);
    } catch (err: any) {
      if (err.code === '23505') {
        return reply.status(409).send({ error: 'CONFLICT', message: 'User is already whitelisted for this rule' });
      }
      throw err;
    }
  });

  // DELETE /admin/whitelist/:id
  fastify.delete('/whitelist/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = await fastify.db.select().from(ruleWhitelist).where(eq(ruleWhitelist.id, id)).limit(1);
    if (!existing[0]) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Whitelist entry not found' });
    }

    await fastify.db.delete(ruleWhitelist).where(eq(ruleWhitelist.id, id));
    request.auditContext = { resourceType: 'rule_whitelist', resourceId: id, action: 'whitelist_revoke', beforeState: existing[0] };
    await request.writeAudit();
    return reply.status(204).send();
  });

  // ==================== ORG MEMBERSHIP ====================

  // GET /admin/org-members — list org memberships
  fastify.get('/org-members', async (request, reply) => {
    const query = request.query as { orgId?: string; userId?: string; page?: string; limit?: string };
    const page = Math.max(1, parseInt(query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || '50', 10)));
    const offset = (page - 1) * limit;

    const conditions: any[] = [];
    if (query.orgId) conditions.push(eq(organizationMembers.orgId, query.orgId));
    if (query.userId) conditions.push(eq(organizationMembers.userId, query.userId));
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalResult] = await fastify.db.select({ count: count() }).from(organizationMembers).where(where);
    const total = totalResult?.count ?? 0;

    const rows = await fastify.db.select().from(organizationMembers)
      .where(where)
      .limit(limit)
      .offset(offset);

    return reply.status(200).send({
      data: rows,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  });

  // POST /admin/org-members — assign user to org
  fastify.post('/org-members', async (request, reply) => {
    const orgMemberSchema = z.object({ orgId: z.string().uuid(), userId: z.string().uuid(), roleInOrg: z.string().max(50).optional() });
    const parseResult = orgMemberSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', message: 'Validation failed', details: parseResult.error.issues.map(i => i.message) });
    }
    const body = parseResult.data;

    // Verify org and user exist
    const [org] = await fastify.db.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, body.orgId)).limit(1);
    if (!org) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Organization not found' });

    const [user] = await fastify.db.select({ id: users.id }).from(users).where(eq(users.id, body.userId)).limit(1);
    if (!user) return reply.status(404).send({ error: 'NOT_FOUND', message: 'User not found' });

    try {
      await fastify.db.insert(organizationMembers).values({
        orgId: body.orgId,
        userId: body.userId,
        roleInOrg: body.roleInOrg || 'member',
      }).onConflictDoNothing();

      request.auditContext = { resourceType: 'org_member', action: 'member_added', afterState: body };
      await request.writeAudit();
      return reply.status(201).send({ orgId: body.orgId, userId: body.userId, roleInOrg: body.roleInOrg || 'member' });
    } catch (err: any) {
      if (err.code === '23505') {
        return reply.status(409).send({ error: 'CONFLICT', message: 'User is already a member of this organization' });
      }
      throw err;
    }
  });

  // DELETE /admin/org-members/:orgId/:userId — remove user from org
  fastify.delete('/org-members/:orgId/:userId', async (request, reply) => {
    const { orgId, userId } = request.params as { orgId: string; userId: string };

    await fastify.db.delete(organizationMembers).where(
      and(eq(organizationMembers.orgId, orgId), eq(organizationMembers.userId, userId)),
    );

    request.auditContext = { resourceType: 'org_member', action: 'member_removed', beforeState: { orgId, userId } };
    await request.writeAudit();
    return reply.status(204).send();
  });
}
