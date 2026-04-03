import type { RuleVersion } from '../domain/rules-engine';

export interface RulesRepositoryPort {
  getActiveVersions(ruleKey: string): Promise<RuleVersion[]>;
  getUserActionCount(userId: string, ruleKey: string, windowSeconds: number): Promise<number>;
  getLastActionTimestamp(userId: string, ruleKey: string): Promise<Date | null>;
  isWhitelisted(userId: string, ruleKey: string): Promise<boolean>;
  recordViolation(userId: string, ruleKey: string): Promise<void>;
  getViolationCount(userId: string, windowSeconds: number): Promise<number>;
}
