import type { EventStatus, RegistrationStatus } from '@studioops/shared';

const EVENT_TRANSITIONS: Record<EventStatus, EventStatus[]> = {
  scheduled: ['confirmed', 'cancelled'],
  confirmed: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

const REGISTRATION_TRANSITIONS: Record<RegistrationStatus, RegistrationStatus[]> = {
  registered: ['confirmed', 'cancelled'],
  confirmed: ['attended', 'no_show'],
  attended: [],
  no_show: [],
  cancelled: [],
};

export function validateEventTransition(
  from: EventStatus,
  to: EventStatus,
): { valid: boolean; error?: string } {
  if (!EVENT_TRANSITIONS[from]?.includes(to)) {
    return { valid: false, error: `Invalid event status transition from '${from}' to '${to}'` };
  }
  return { valid: true };
}

export function validateRegistrationTransition(
  from: RegistrationStatus,
  to: RegistrationStatus,
): { valid: boolean; error?: string } {
  if (!REGISTRATION_TRANSITIONS[from]?.includes(to)) {
    return { valid: false, error: `Invalid registration status transition from '${from}' to '${to}'` };
  }
  return { valid: true };
}

export function isTerminalEventStatus(status: EventStatus): boolean {
  return status === 'completed' || status === 'cancelled';
}

export function isTerminalRegistrationStatus(status: RegistrationStatus): boolean {
  return status === 'attended' || status === 'no_show' || status === 'cancelled';
}
