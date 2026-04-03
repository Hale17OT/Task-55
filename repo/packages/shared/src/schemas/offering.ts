import { z } from 'zod';

export const createOfferingSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(200, 'Title must be at most 200 characters'),
  description: z.string().max(5000).optional().default(''),
  basePriceCents: z.number().int('Price must be an integer (cents)').min(0, 'Price must be non-negative'),
  durationMinutes: z.number().int('Duration must be an integer (minutes)').positive('Duration must be positive'),
  tags: z.array(z.string()).default([]),
  visibility: z.enum(['public', 'private', 'restricted']).default('public'),
  orgId: z.string().uuid('Invalid organization ID'),
});

export const updateOfferingSchema = z.object({
  title: z.string().min(3).max(200).optional(),
  description: z.string().max(5000).optional(),
  basePriceCents: z.number().int('Price must be an integer (cents)').min(0).optional(),
  durationMinutes: z.number().int('Duration must be an integer (minutes)').positive().optional(),
  tags: z.array(z.string()).optional(),
  visibility: z.enum(['public', 'private', 'restricted']).optional(),
});

export const changeOfferingStatusSchema = z.object({
  status: z.enum(['active', 'archived']),
});

export const createAddonSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  priceCents: z.number().int('Price must be an integer (cents)').min(0, 'Price must be non-negative'),
  unitDescription: z.string().min(1, 'Unit description is required').max(50),
});

export const grantAccessSchema = z.object({
  userIds: z.array(z.string().uuid()).min(1, 'At least one user ID is required'),
});

export type CreateOfferingInput = z.infer<typeof createOfferingSchema>;
export type UpdateOfferingInput = z.infer<typeof updateOfferingSchema>;
export type CreateAddonInput = z.infer<typeof createAddonSchema>;
