import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { EnforceQuotaUseCase } from '../../core/use-cases/enforce-quota';
import { QuotaExceededError, CooldownError } from '../../core/domain/rules-engine';
import { DrizzleLockoutRepository } from '../persistence/lockout-repository';
import type { Role } from '@studioops/shared';
import type { RulesRepositoryPort } from '../../core/ports/rules-repository.port';
import type { RuleVersion } from '../../core/domain/rules-engine';
import { eq, and, gt, desc, sql } from 'drizzle-orm';
import { rules, userViolations, ruleWhitelist, auditLogs } from '@studioops/db/schema';

declare module 'fastify' {
  interface FastifyInstance {
    enforceQuota: (ruleKey: string) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

/**
 * Maps rule keys to exact audit log resourceType + action used for counting.
 * The action field must match the explicit action set via auditContext on the route.
 * This prevents unrelated actions on the same resource from triggering quotas.
 */
const RULE_KEY_TO_AUDIT: Record<string, { resourceType: string; action: string }> = {
  daily_upload_limit: { resourceType: 'portfolio', action: 'portfolio.upload' },
  hourly_portfolio_edit_limit: { resourceType: 'portfolio', action: 'portfolio.edit' },
  export_cooldown: { resourceType: 'analytics', action: 'analytics.export' },
};

class DrizzleRulesRepository implements RulesRepositoryPort {
  constructor(private db: any) {}

  async getActiveVersions(ruleKey: string): Promise<RuleVersion[]> {
    const rows = await this.db.select().from(rules)
      .where(and(eq(rules.ruleKey, ruleKey), eq(rules.status, 'active')))
      .orderBy(desc(rules.version));
    return rows.map((r: any) => ({
      id: r.id,
      ruleKey: r.ruleKey,
      version: r.version,
      config: r.config,
      effectiveFrom: r.effectiveFrom,
      effectiveTo: r.effectiveTo,
      canaryPercent: r.canaryPercent,
      status: r.status,
    }));
  }

  async getUserActionCount(userId: string, ruleKey: string, windowSeconds: number): Promise<number> {
    const mapping = RULE_KEY_TO_AUDIT[ruleKey];
    if (!mapping) return 0; // unknown rule key = no enforcement
    const since = new Date(Date.now() - windowSeconds * 1000);
    const [result] = await this.db.select({ count: sql<number>`count(*)::int` })
      .from(auditLogs)
      .where(and(
        eq(auditLogs.actorId, userId),
        eq(auditLogs.resourceType, mapping.resourceType),
        eq(auditLogs.action, mapping.action),
        gt(auditLogs.createdAt, since),
      ));
    return result?.count ?? 0;
  }

  async getLastActionTimestamp(userId: string, ruleKey: string): Promise<Date | null> {
    const mapping = RULE_KEY_TO_AUDIT[ruleKey];
    if (!mapping) return null;
    const rows = await this.db.select({ createdAt: auditLogs.createdAt })
      .from(auditLogs)
      .where(and(
        eq(auditLogs.actorId, userId),
        eq(auditLogs.resourceType, mapping.resourceType),
        eq(auditLogs.action, mapping.action),
      ))
      .orderBy(desc(auditLogs.createdAt))
      .limit(1);
    return rows[0]?.createdAt ?? null;
  }

  async isWhitelisted(userId: string, ruleKey: string): Promise<boolean> {
    const rows = await this.db.select().from(ruleWhitelist)
      .where(and(eq(ruleWhitelist.userId, userId), eq(ruleWhitelist.ruleKey, ruleKey)))
      .limit(1);
    return rows.length > 0;
  }

  async recordViolation(userId: string, ruleKey: string): Promise<void> {
    await this.db.insert(userViolations).values({ userId, ruleKey });
  }

  async getViolationCount(userId: string, windowSeconds: number): Promise<number> {
    const since = new Date(Date.now() - windowSeconds * 1000);
    const [result] = await this.db.select({ count: sql<number>`count(*)::int` })
      .from(userViolations)
      .where(and(eq(userViolations.userId, userId), gt(userViolations.createdAt, since)));
    return result?.count ?? 0;
  }
}

async function rulesEnginePlugin(fastify: FastifyInstance) {
  const rulesRepo = new DrizzleRulesRepository(fastify.db);
  const lockoutRepo = new DrizzleLockoutRepository(fastify.db);
  const enforceQuota = new EnforceQuotaUseCase(rulesRepo, lockoutRepo);

  fastify.decorate('enforceQuota', function (ruleKey: string) {
    return async function (request: FastifyRequest, reply: FastifyReply) {
      if (!request.user?.sub) return; // unauthenticated = skip

      try {
        await enforceQuota.execute({
          userId: request.user.sub,
          role: request.user.role as Role,
          ruleKey,
        });
      } catch (err) {
        if (err instanceof QuotaExceededError) {
          return reply.status(429).send({
            error: 'QUOTA_EXCEEDED',
            message: err.message,
            ruleKey: err.ruleKey,
            limit: err.limit,
            current: err.current,
            retryAfter: err.retryAfter,
          });
        }
        if (err instanceof CooldownError) {
          return reply.status(429).send({
            error: 'COOLDOWN_ACTIVE',
            message: err.message,
            retryAfterSeconds: err.retryAfter,
          });
        }
        throw err;
      }
    };
  });
}

export default fp(rulesEnginePlugin, {
  name: 'rules-engine',
  dependencies: ['database'],
  fastify: '5.x',
});
