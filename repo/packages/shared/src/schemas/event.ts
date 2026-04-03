import { z } from 'zod';

export const createEventSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(200),
  description: z.string().max(5000).optional().default(''),
  eventType: z.string().min(1, 'Event type is required').max(100),
  scheduledAt: z.string().datetime({ message: 'scheduledAt must be ISO 8601 datetime' }),
  durationMinutes: z.number().int().positive('Duration must be positive'),
  channel: z.string().min(1).max(100).default('website'),
  tags: z.array(z.string().max(50)).max(20).default([]),
  orgId: z.string().uuid('Invalid organization ID'),
  offeringId: z.string().uuid().optional(),
});

export const updateEventSchema = z.object({
  title: z.string().min(3).max(200).optional(),
  description: z.string().max(5000).optional(),
  eventType: z.string().min(1).max(100).optional(),
  scheduledAt: z.string().datetime().optional(),
  durationMinutes: z.number().int().positive().optional(),
  channel: z.string().min(1).max(100).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
});

export const changeEventStatusSchema = z.object({
  status: z.enum(['confirmed', 'completed', 'cancelled']),
});

export const createRegistrationSchema = z.object({
  clientId: z.string().uuid('Invalid client ID').optional(),
});

export const changeRegistrationStatusSchema = z.object({
  status: z.enum(['confirmed', 'attended', 'no_show', 'cancelled']),
  cancelReason: z.string().max(500).optional(),
});

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
export type CreateRegistrationInput = z.infer<typeof createRegistrationSchema>;
