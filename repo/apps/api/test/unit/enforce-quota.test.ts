import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EnforceQuotaUseCase } from '../../src/core/use-cases/enforce-quota';
import { QuotaExceededError, CooldownError } from '../../src/core/domain/rules-engine';
import type { RulesRepositoryPort } from '../../src/core/ports/rules-repository.port';
import type { LockoutRepositoryPort } from '../../src/core/ports/lockout-repository.port';
import type { RuleVersion } from '../../src/core/domain/rules-engine';

function makeVersions(): RuleVersion[] {
  return [{
    id: 'rule-1',
    ruleKey: 'daily_upload_limit',
    version: 1,
    config: { limit: 20, window: 'day' as const },
    effectiveFrom: new Date('2020-01-01'),
    effectiveTo: null,
    canaryPercent: 100,
    status: 'active',
  }];
}

describe('EnforceQuotaUseCase', () => {
  let rulesRepo: RulesRepositoryPort;
  let lockoutRepo: LockoutRepositoryPort;
  let useCase: EnforceQuotaUseCase;

  beforeEach(() => {
    rulesRepo = {
      getActiveVersions: vi.fn().mockResolvedValue(makeVersions()),
      getUserActionCount: vi.fn().mockResolvedValue(5),
      getLastActionTimestamp: vi.fn().mockResolvedValue(null),
      isWhitelisted: vi.fn().mockResolvedValue(false),
      recordViolation: vi.fn(),
      getViolationCount: vi.fn().mockResolvedValue(0),
    };
    lockoutRepo = {
      getActiveLockout: vi.fn().mockResolvedValue(null),
      getActiveLockoutByType: vi.fn().mockResolvedValue(null),
      recordFailedAttempt: vi.fn(),
      getRecentFailedAttemptCount: vi.fn(),
      createLockout: vi.fn(),
      clearFailedAttempts: vi.fn(),
    };
    useCase = new EnforceQuotaUseCase(rulesRepo, lockoutRepo);
  });

  it('allows action under limit', async () => {
    await expect(
      useCase.execute({ userId: 'user-1', role: 'merchant', ruleKey: 'daily_upload_limit' }),
    ).resolves.toBeUndefined();
  });

  it('throws QuotaExceededError at limit', async () => {
    vi.mocked(rulesRepo.getUserActionCount).mockResolvedValue(20); // at limit

    await expect(
      useCase.execute({ userId: 'user-1', role: 'merchant', ruleKey: 'daily_upload_limit' }),
    ).rejects.toThrow(QuotaExceededError);
  });

  it('respects cooldown', async () => {
    vi.mocked(rulesRepo.getActiveVersions).mockResolvedValue([{
      ...makeVersions()[0],
      config: { limit: 100, window: 'day' as const, cooldownSeconds: 60 },
    }]);
    vi.mocked(rulesRepo.getLastActionTimestamp).mockResolvedValue(new Date(Date.now() - 30_000)); // 30s ago

    await expect(
      useCase.execute({ userId: 'user-1', role: 'merchant', ruleKey: 'export_cooldown' }),
    ).rejects.toThrow(CooldownError);
  });

  it('records violation on quota breach', async () => {
    vi.mocked(rulesRepo.getUserActionCount).mockResolvedValue(20);

    try {
      await useCase.execute({ userId: 'user-1', role: 'merchant', ruleKey: 'daily_upload_limit' });
    } catch {}

    expect(rulesRepo.recordViolation).toHaveBeenCalledWith('user-1', 'daily_upload_limit');
  });

  it('disables account after 3 violations in 24h', async () => {
    vi.mocked(rulesRepo.getUserActionCount).mockResolvedValue(20);
    vi.mocked(rulesRepo.getViolationCount).mockResolvedValue(3);

    try {
      await useCase.execute({ userId: 'user-1', role: 'merchant', ruleKey: 'daily_upload_limit' });
    } catch {}

    expect(lockoutRepo.createLockout).toHaveBeenCalledWith(
      'user-1',
      expect.any(Date),
      expect.stringContaining('3'),
      'penalty',
    );
  });

  it('does not disable at 2 violations', async () => {
    vi.mocked(rulesRepo.getUserActionCount).mockResolvedValue(20);
    vi.mocked(rulesRepo.getViolationCount).mockResolvedValue(2);

    try {
      await useCase.execute({ userId: 'user-1', role: 'merchant', ruleKey: 'daily_upload_limit' });
    } catch {}

    expect(lockoutRepo.createLockout).not.toHaveBeenCalled();
  });

  it('allows Admin to bypass quota', async () => {
    vi.mocked(rulesRepo.getUserActionCount).mockResolvedValue(999);

    await expect(
      useCase.execute({ userId: 'admin-1', role: 'administrator', ruleKey: 'daily_upload_limit' }),
    ).resolves.toBeUndefined();

    // Admin doesn't even check the rule
    expect(rulesRepo.getActiveVersions).not.toHaveBeenCalled();
  });

  it('allows whitelisted user to bypass quota', async () => {
    vi.mocked(rulesRepo.isWhitelisted).mockResolvedValue(true);
    vi.mocked(rulesRepo.getUserActionCount).mockResolvedValue(999);

    await expect(
      useCase.execute({ userId: 'user-1', role: 'merchant', ruleKey: 'daily_upload_limit' }),
    ).resolves.toBeUndefined();

    expect(rulesRepo.getActiveVersions).not.toHaveBeenCalled();
  });

  it('returns without quota when no rules exist', async () => {
    vi.mocked(rulesRepo.getActiveVersions).mockResolvedValue([]);

    await expect(
      useCase.execute({ userId: 'user-1', role: 'merchant', ruleKey: 'nonexistent' }),
    ).resolves.toBeUndefined();
  });
});
