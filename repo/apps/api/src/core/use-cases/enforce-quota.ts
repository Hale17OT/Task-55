import { QUOTAS } from '@studioops/shared';
import {
  resolveRuleVersion,
  getWindowSeconds,
  QuotaExceededError,
  CooldownError,
  type RuleConfig,
} from '../domain/rules-engine';
import { isAdminRole } from '../domain/permissions';
import type { RulesRepositoryPort } from '../ports/rules-repository.port';
import type { LockoutRepositoryPort } from '../ports/lockout-repository.port';
import type { Role } from '@studioops/shared';

export interface EnforceQuotaInput {
  userId: string;
  role: Role;
  ruleKey: string;
}

export class EnforceQuotaUseCase {
  constructor(
    private rulesRepo: RulesRepositoryPort,
    private lockoutRepo: LockoutRepositoryPort,
  ) {}

  async execute(input: EnforceQuotaInput): Promise<void> {
    const { userId, role, ruleKey } = input;

    // Admin always bypasses quotas
    if (isAdminRole(role)) return;

    // Check whitelist
    const whitelisted = await this.rulesRepo.isWhitelisted(userId, ruleKey);
    if (whitelisted) return;

    // Check if user has an active quota penalty (not auth lockout)
    const activePenalty = await this.lockoutRepo.getActiveLockoutByType(userId, 'penalty');
    if (activePenalty && activePenalty.expiresAt && activePenalty.expiresAt > new Date()) {
      const retryAfter = Math.ceil((activePenalty.expiresAt.getTime() - Date.now()) / 1000);
      throw new QuotaExceededError(ruleKey, 0, 0, retryAfter);
    }

    // Load rule versions (newest first)
    const versions = await this.rulesRepo.getActiveVersions(ruleKey);
    if (versions.length === 0) return; // No rule = no quota

    const rule = resolveRuleVersion(versions, userId);
    if (!rule) return; // No matching version (user outside canary)

    const config = rule.config as RuleConfig;

    // Cooldown check
    if (config.cooldownSeconds) {
      const lastAction = await this.rulesRepo.getLastActionTimestamp(userId, ruleKey);
      if (lastAction) {
        const elapsed = (Date.now() - lastAction.getTime()) / 1000;
        if (elapsed < config.cooldownSeconds) {
          const retryAfter = Math.ceil(config.cooldownSeconds - elapsed);
          throw new CooldownError(retryAfter);
        }
      }
    }

    // Quota check
    const windowSec = getWindowSeconds(config.window);
    const currentCount = await this.rulesRepo.getUserActionCount(userId, ruleKey, windowSec);

    if (currentCount >= config.limit) {
      // Record violation
      await this.rulesRepo.recordViolation(userId, ruleKey);

      // Check escalation: 3 violations in 24h → 30min penalty
      const violationCount = await this.rulesRepo.getViolationCount(userId, 86400);
      if (violationCount >= QUOTAS.VIOLATION_THRESHOLD) {
        const penaltyExpiry = new Date(Date.now() + QUOTAS.PENALTY_DURATION_SECONDS * 1000);
        await this.lockoutRepo.createLockout(
          userId,
          penaltyExpiry,
          `${violationCount} quota violations in 24 hours`,
          'penalty',
        );
      }

      const retryAfter = windowSec; // simplified: retry after one full window
      throw new QuotaExceededError(ruleKey, config.limit, currentCount, retryAfter);
    }
  }
}
