import { describe, it, expect } from 'vitest';
import { validateStatusTransition, isArchived } from '../../src/core/domain/offering';
import { createOfferingSchema, createAddonSchema } from '@studioops/shared';

describe('Offering entity', () => {
  describe('Zod validation', () => {
    it('rejects negative basePriceCents', () => {
      const result = createOfferingSchema.safeParse({
        title: 'Test Package',
        basePriceCents: -100,
        durationMinutes: 60,
        orgId: '00000000-0000-0000-0000-000000000001',
      });
      expect(result.success).toBe(false);
    });

    it('rejects float basePriceCents', () => {
      const result = createOfferingSchema.safeParse({
        title: 'Test Package',
        basePriceCents: 99.99,
        durationMinutes: 60,
        orgId: '00000000-0000-0000-0000-000000000001',
      });
      expect(result.success).toBe(false);
    });

    it('rejects zero durationMinutes', () => {
      const result = createOfferingSchema.safeParse({
        title: 'Test Package',
        basePriceCents: 1000,
        durationMinutes: 0,
        orgId: '00000000-0000-0000-0000-000000000001',
      });
      expect(result.success).toBe(false);
    });

    it('rejects negative durationMinutes', () => {
      const result = createOfferingSchema.safeParse({
        title: 'Test Package',
        basePriceCents: 1000,
        durationMinutes: -30,
        orgId: '00000000-0000-0000-0000-000000000001',
      });
      expect(result.success).toBe(false);
    });

    it('rejects title shorter than 3 characters', () => {
      const result = createOfferingSchema.safeParse({
        title: 'AB',
        basePriceCents: 1000,
        durationMinutes: 60,
        orgId: '00000000-0000-0000-0000-000000000001',
      });
      expect(result.success).toBe(false);
    });

    it('rejects title longer than 200 characters', () => {
      const result = createOfferingSchema.safeParse({
        title: 'A'.repeat(201),
        basePriceCents: 1000,
        durationMinutes: 60,
        orgId: '00000000-0000-0000-0000-000000000001',
      });
      expect(result.success).toBe(false);
    });

    it('accepts valid offering data', () => {
      const result = createOfferingSchema.safeParse({
        title: 'Wedding Essentials',
        description: 'Full wedding coverage',
        basePriceCents: 250000,
        durationMinutes: 360,
        visibility: 'public',
        orgId: '00000000-0000-0000-0000-000000000001',
      });
      expect(result.success).toBe(true);
    });

    it('defaults visibility to public', () => {
      const result = createOfferingSchema.parse({
        title: 'Test Package',
        basePriceCents: 1000,
        durationMinutes: 60,
        orgId: '00000000-0000-0000-0000-000000000001',
      });
      expect(result.visibility).toBe('public');
    });
  });

  describe('Status transitions', () => {
    it('allows draft → active', () => {
      expect(validateStatusTransition('draft', 'active').valid).toBe(true);
    });

    it('allows draft → archived', () => {
      expect(validateStatusTransition('draft', 'archived').valid).toBe(true);
    });

    it('allows active → archived', () => {
      expect(validateStatusTransition('active', 'archived').valid).toBe(true);
    });

    it('rejects archived → active', () => {
      const result = validateStatusTransition('archived', 'active');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('archived');
    });

    it('rejects archived → draft', () => {
      expect(validateStatusTransition('archived', 'draft').valid).toBe(false);
    });

    it('rejects active → draft', () => {
      expect(validateStatusTransition('active', 'draft').valid).toBe(false);
    });
  });

  describe('isArchived', () => {
    it('returns true for archived', () => {
      expect(isArchived('archived')).toBe(true);
    });

    it('returns false for draft and active', () => {
      expect(isArchived('draft')).toBe(false);
      expect(isArchived('active')).toBe(false);
    });
  });
});

describe('Addon validation', () => {
  it('rejects negative priceCents', () => {
    const result = createAddonSchema.safeParse({
      name: 'Extra Hour',
      priceCents: -100,
      unitDescription: 'per hour',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty name', () => {
    const result = createAddonSchema.safeParse({
      name: '',
      priceCents: 1500,
      unitDescription: 'each',
    });
    expect(result.success).toBe(false);
  });

  it('accepts valid addon', () => {
    const result = createAddonSchema.safeParse({
      name: 'Second Shooter',
      priceCents: 8000,
      unitDescription: 'per hour',
    });
    expect(result.success).toBe(true);
  });
});
