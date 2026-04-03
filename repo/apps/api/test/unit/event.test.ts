import { describe, it, expect } from 'vitest';
import {
  validateEventTransition,
  validateRegistrationTransition,
  isTerminalEventStatus,
  isTerminalRegistrationStatus,
} from '../../src/core/domain/event';
import { createEventSchema, changeRegistrationStatusSchema } from '@studioops/shared';

describe('Event status transitions', () => {
  it('allows scheduled → confirmed', () => {
    expect(validateEventTransition('scheduled', 'confirmed').valid).toBe(true);
  });

  it('allows scheduled → cancelled', () => {
    expect(validateEventTransition('scheduled', 'cancelled').valid).toBe(true);
  });

  it('allows confirmed → completed', () => {
    expect(validateEventTransition('confirmed', 'completed').valid).toBe(true);
  });

  it('allows confirmed → cancelled', () => {
    expect(validateEventTransition('confirmed', 'cancelled').valid).toBe(true);
  });

  it('rejects completed → anything', () => {
    expect(validateEventTransition('completed', 'scheduled').valid).toBe(false);
    expect(validateEventTransition('completed', 'cancelled').valid).toBe(false);
  });

  it('rejects cancelled → anything', () => {
    expect(validateEventTransition('cancelled', 'scheduled').valid).toBe(false);
    expect(validateEventTransition('cancelled', 'confirmed').valid).toBe(false);
  });

  it('rejects scheduled → completed (must confirm first)', () => {
    expect(validateEventTransition('scheduled', 'completed').valid).toBe(false);
  });
});

describe('Registration status transitions', () => {
  it('allows registered → confirmed', () => {
    expect(validateRegistrationTransition('registered', 'confirmed').valid).toBe(true);
  });

  it('allows registered → cancelled', () => {
    expect(validateRegistrationTransition('registered', 'cancelled').valid).toBe(true);
  });

  it('allows confirmed → attended', () => {
    expect(validateRegistrationTransition('confirmed', 'attended').valid).toBe(true);
  });

  it('allows confirmed → no_show', () => {
    expect(validateRegistrationTransition('confirmed', 'no_show').valid).toBe(true);
  });

  it('rejects attended → anything (terminal)', () => {
    expect(validateRegistrationTransition('attended', 'confirmed').valid).toBe(false);
    expect(validateRegistrationTransition('attended', 'cancelled').valid).toBe(false);
  });

  it('rejects no_show → anything (terminal)', () => {
    expect(validateRegistrationTransition('no_show', 'confirmed').valid).toBe(false);
  });

  it('rejects cancelled → anything (terminal)', () => {
    expect(validateRegistrationTransition('cancelled', 'registered').valid).toBe(false);
  });

  it('rejects registered → attended (must confirm first)', () => {
    expect(validateRegistrationTransition('registered', 'attended').valid).toBe(false);
  });
});

describe('Terminal status checks', () => {
  it('completed and cancelled are terminal event statuses', () => {
    expect(isTerminalEventStatus('completed')).toBe(true);
    expect(isTerminalEventStatus('cancelled')).toBe(true);
    expect(isTerminalEventStatus('scheduled')).toBe(false);
    expect(isTerminalEventStatus('confirmed')).toBe(false);
  });

  it('attended, no_show, cancelled are terminal registration statuses', () => {
    expect(isTerminalRegistrationStatus('attended')).toBe(true);
    expect(isTerminalRegistrationStatus('no_show')).toBe(true);
    expect(isTerminalRegistrationStatus('cancelled')).toBe(true);
    expect(isTerminalRegistrationStatus('registered')).toBe(false);
    expect(isTerminalRegistrationStatus('confirmed')).toBe(false);
  });
});

describe('Event Zod validation', () => {
  it('accepts valid event data', () => {
    const result = createEventSchema.safeParse({
      title: 'Wedding Photography',
      eventType: 'wedding',
      scheduledAt: '2026-06-15T10:00:00Z',
      durationMinutes: 480,
      channel: 'referral',
      tags: ['wedding', 'outdoor'],
      orgId: '00000000-0000-0000-0000-000000000001',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid scheduledAt', () => {
    const result = createEventSchema.safeParse({
      title: 'Test Event',
      eventType: 'test',
      scheduledAt: 'not-a-date',
      durationMinutes: 60,
      orgId: '00000000-0000-0000-0000-000000000001',
    });
    expect(result.success).toBe(false);
  });

  it('rejects zero durationMinutes', () => {
    const result = createEventSchema.safeParse({
      title: 'Test Event',
      eventType: 'test',
      scheduledAt: '2026-06-15T10:00:00Z',
      durationMinutes: 0,
      orgId: '00000000-0000-0000-0000-000000000001',
    });
    expect(result.success).toBe(false);
  });

  it('defaults tags to empty array', () => {
    const result = createEventSchema.parse({
      title: 'Test Event',
      eventType: 'test',
      scheduledAt: '2026-06-15T10:00:00Z',
      durationMinutes: 60,
      orgId: '00000000-0000-0000-0000-000000000001',
    });
    expect(result.tags).toEqual([]);
  });
});
