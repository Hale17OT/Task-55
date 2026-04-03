import { createHash } from 'node:crypto';

export interface RuleVersion {
  id: string;
  ruleKey: string;
  version: number;
  config: RuleConfig;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  canaryPercent: number;
  status: string;
}

export interface RuleConfig {
  limit: number;
  window: 'minute' | 'hour' | 'day';
  cooldownSeconds?: number;
}

/**
 * Deterministic canary hash.
 * Uses SHA-256(userId + ruleId) mod 100. If result < canaryPercent, user is in canary.
 */
export function isInCanary(userId: string, ruleId: string, canaryPercent: number): boolean {
  if (canaryPercent >= 100) return true;
  if (canaryPercent <= 0) return false;

  const hash = createHash('sha256').update(userId + ruleId).digest();
  // Take first 4 bytes as unsigned 32-bit integer
  const value = hash.readUInt32BE(0);
  const bucket = value % 100;
  return bucket < canaryPercent;
}

/**
 * Resolve which rule version to apply for a given user.
 * Versions must be sorted by version DESC (newest first).
 */
export function resolveRuleVersion(
  versions: RuleVersion[],
  userId: string,
  now: Date = new Date(),
): RuleVersion | null {
  for (const rule of versions) {
    if (rule.status !== 'active') continue;
    if (rule.effectiveFrom > now) continue;
    if (rule.effectiveTo && rule.effectiveTo < now) continue;

    if (isInCanary(userId, rule.id, rule.canaryPercent)) {
      return rule;
    }
    // If user is not in canary for this version, try the next (older) version
  }
  return null;
}

export function getWindowSeconds(window: RuleConfig['window']): number {
  switch (window) {
    case 'minute': return 60;
    case 'hour': return 3600;
    case 'day': return 86400;
  }
}

export class QuotaExceededError extends Error {
  public readonly statusCode = 429;
  public readonly ruleKey: string;
  public readonly limit: number;
  public readonly current: number;
  public readonly retryAfter: number;

  constructor(ruleKey: string, limit: number, current: number, retryAfter: number) {
    super(`Quota exceeded for ${ruleKey}`);
    this.name = 'QuotaExceededError';
    this.ruleKey = ruleKey;
    this.limit = limit;
    this.current = current;
    this.retryAfter = retryAfter;
  }
}

export class CooldownError extends Error {
  public readonly statusCode = 429;
  public readonly retryAfter: number;

  constructor(retryAfter: number) {
    super('Cooldown active');
    this.name = 'CooldownError';
    this.retryAfter = retryAfter;
  }
}
