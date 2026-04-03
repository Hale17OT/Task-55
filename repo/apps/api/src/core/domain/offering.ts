import type { OfferingStatus, VisibilityType } from '@studioops/shared';

const VALID_TRANSITIONS: Record<OfferingStatus, OfferingStatus[]> = {
  draft: ['active', 'archived'],
  active: ['archived'],
  archived: [],
};

export function validateStatusTransition(
  from: OfferingStatus,
  to: OfferingStatus,
): { valid: boolean; error?: string } {
  if (!VALID_TRANSITIONS[from]?.includes(to)) {
    return {
      valid: false,
      error: `Invalid status transition from '${from}' to '${to}'`,
    };
  }
  return { valid: true };
}

export function isArchived(status: OfferingStatus): boolean {
  return status === 'archived';
}
