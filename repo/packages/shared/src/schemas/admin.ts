import { z } from 'zod';

export const updateRolePermissionsSchema = z.object({
  permissions: z.array(z.string().min(1)).min(0),
});

export const createRuleSchema = z.object({
  ruleKey: z.string().min(1).max(100),
  description: z.string().max(500).optional().default(''),
  config: z.object({
    limit: z.number().int().positive(),
    window: z.enum(['minute', 'hour', 'day']),
    cooldownSeconds: z.number().int().min(0).optional(),
  }),
  effectiveFrom: z.string().datetime({ message: 'effectiveFrom must be ISO 8601' }),
  effectiveTo: z.string().datetime().optional().nullable(),
  canaryPercent: z.number().int().min(0).max(100).default(100),
});

export const updateRuleSchema = z.object({
  description: z.string().max(500).optional(),
  config: z.object({
    limit: z.number().int().positive(),
    window: z.enum(['minute', 'hour', 'day']),
    cooldownSeconds: z.number().int().min(0).optional(),
  }).optional(),
  effectiveFrom: z.string().datetime().optional(),
  effectiveTo: z.string().datetime().optional().nullable(),
  canaryPercent: z.number().int().min(0).max(100).optional(),
});

export const updateConfigSchema = z.object({
  value: z.string().min(1),
  isEncrypted: z.boolean().optional().default(false),
});

export const revealConfigSchema = z.object({
  password: z.string().min(1, 'Password is required'),
});

export type CreateRuleInput = z.infer<typeof createRuleSchema>;
export type UpdateRuleInput = z.infer<typeof updateRuleSchema>;
