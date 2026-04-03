export interface LockoutRecord {
  id: string;
  userId: string;
  restrictionType: string;
  reason: string | null;
  expiresAt: Date | null;
  failedAttempts: number;
  failedWindowStart: Date | null;
}

export interface LockoutRepositoryPort {
  getActiveLockout(userId: string): Promise<LockoutRecord | null>;
  getActiveLockoutByType(userId: string, type: 'lockout' | 'penalty'): Promise<LockoutRecord | null>;
  recordFailedAttempt(userId: string): Promise<number>;
  getRecentFailedAttemptCount(userId: string, windowSeconds: number): Promise<number>;
  createLockout(userId: string, expiresAt: Date, reason: string, type?: 'lockout' | 'penalty'): Promise<void>;
  clearFailedAttempts(userId: string): Promise<void>;
}
