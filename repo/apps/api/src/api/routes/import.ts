import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { DrizzleOfferingRepository } from '../../infrastructure/persistence/offering-repository';
import { DrizzleCleansingRepository } from '../../infrastructure/persistence/cleansing-repository';
import { autoCleanseRecord, type CleansingTarget } from '../../core/use-cases/auto-cleanse';
import { normalizeCurrency, normalizeDuration, cmToInches, pixelsToInches } from '../../core/domain/normalizers';
import type { Role } from '@studioops/shared';

const importOfferingSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  price: z.number().positive(),
  currency: z.string().min(3).max(3).default('USD'),
  duration: z.number().positive(),
  durationUnit: z.enum(['minutes', 'hours', 'seconds']).default('minutes'),
  visibility: z.enum(['public', 'private', 'restricted']).default('public'),
  tags: z.array(z.string()).default([]),
});

const importBatchSchema = z.object({
  orgId: z.string().uuid(),
  offerings: z.array(importOfferingSchema).min(1).max(100),
});

export default async function importRoutes(fastify: FastifyInstance) {
  const offeringRepo = new DrizzleOfferingRepository(fastify.db);
  const cleansingRepo = new DrizzleCleansingRepository(fastify.db);

  /**
   * POST /import/offerings — Bulk import offerings with full cleansing pipeline.
   * Normalizes currency to USD cents, duration to minutes.
   * Flags outliers and missing values.
   * Detects duplicates against existing records.
   */
  fastify.post('/offerings', {
    preHandler: [fastify.authenticate, fastify.authorize('offering', 'create')],
  }, async (request, reply) => {
    const parseResult = importBatchSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: parseResult.error.issues.map(i => i.message),
      });
    }

    const { orgId, offerings: rawOfferings } = parseResult.data;

    // Verify merchant is in org
    if (request.authContext?.orgScope && !request.authContext.orgScope.includes(orgId)) {
      return reply.status(403).send({ error: 'FORBIDDEN', message: 'You are not a member of this organization' });
    }

    // Load existing offerings for dedup comparison
    const existingList = await offeringRepo.list({ page: 1, limit: 500, orgId, role: 'administrator' as Role });
    const existingTargets: CleansingTarget[] = existingList.data.map(o => ({
      id: o.id, title: o.title, priceCents: o.basePriceCents,
      durationMinutes: o.durationMinutes, tags: o.tags ?? [], orgId: o.orgId,
    }));
    const medianPrice = existingTargets.length > 0
      ? existingTargets.map(t => t.priceCents).sort((a, b) => a - b)[Math.floor(existingTargets.length / 2)]
      : 0;

    const results: Array<{ title: string; id?: string; status: string; flags: any[]; duplicates: any[] }> = [];

    for (const raw of rawOfferings) {
      // 1. Normalize currency → USD cents
      const currencyResult = normalizeCurrency(raw.price, raw.currency);
      const priceCents = currencyResult.cents;

      // 2. Normalize duration → minutes
      const durationMinutes = Math.round(normalizeDuration(raw.duration, raw.durationUnit));

      // 3. Create the offering
      const offering = await offeringRepo.create({
        orgId,
        merchantId: request.user.sub,
        title: raw.title,
        description: raw.description,
        basePriceCents: priceCents,
        durationMinutes,
        tags: raw.tags,
        visibility: raw.visibility,
      });

      // 4. Run auto-cleansing (outliers, missing fields, duplicates)
      const target: CleansingTarget = {
        id: offering.id, title: offering.title, priceCents, durationMinutes,
        tags: raw.tags, orgId,
        rawCurrency: raw.currency !== 'USD' ? raw.currency : undefined,
        rawDuration: raw.durationUnit !== 'minutes' ? { value: raw.duration, unit: raw.durationUnit } : undefined,
      };

      const cleansed = autoCleanseRecord(target, existingTargets, medianPrice);

      // 5. Persist flags
      if (currencyResult.flagged) {
        cleansed.flags.push({ field: 'currency', issue: 'UNKNOWN_CURRENCY', detail: { currency: raw.currency } });
      }

      for (const flag of cleansed.flags) {
        await cleansingRepo.createFlag({ recordType: 'offering', recordId: offering.id, field: flag.field, issue: flag.issue, detail: flag.detail });
      }

      // 6. Persist duplicate candidates
      for (const dup of cleansed.duplicateCandidates) {
        await cleansingRepo.createCandidate({
          recordType: 'offering', recordAId: offering.id, recordBId: dup.existingId,
          similarityScore: dup.score, featureScores: dup.featureScores,
        });
      }

      // Add to existing targets for subsequent dedup checks within the batch
      existingTargets.push(target);

      results.push({
        title: raw.title,
        id: offering.id,
        status: 'imported',
        flags: cleansed.flags,
        duplicates: cleansed.duplicateCandidates,
      });
    }

    request.auditContext = {
      resourceType: 'import',
      afterState: { count: results.length, orgId },
    };

    return reply.status(201).send({
      imported: results.length,
      results,
    });
  });

  /**
   * POST /import/cleanse — Run cleansing on existing internal records (internal feeds).
   * Normalizes, flags outliers/missing, and detects duplicates across existing offerings in an org.
   * This supplements import/upload-time cleansing by allowing batch re-analysis of internal data.
   */
  fastify.post('/cleanse', {
    preHandler: [fastify.authenticate, fastify.authorize('data_quality', 'review')],
  }, async (request, reply) => {
    const body = request.body as { orgId: string };
    if (!body.orgId) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', message: 'orgId is required' });
    }

    // Org scope check
    if (request.user.role !== 'administrator') {
      if (request.authContext?.orgScope && !request.authContext.orgScope.includes(body.orgId)) {
        return reply.status(403).send({ error: 'FORBIDDEN', message: 'Organization not in your scope' });
      }
    }

    // Load all active offerings in the org
    const allOfferings = await offeringRepo.list({ page: 1, limit: 500, orgId: body.orgId, role: 'administrator' as Role });
    const targets: CleansingTarget[] = allOfferings.data.map(o => ({
      id: o.id, title: o.title, priceCents: o.basePriceCents,
      durationMinutes: o.durationMinutes, tags: o.tags ?? [], orgId: o.orgId,
    }));

    if (targets.length === 0) {
      return reply.status(200).send({ cleansed: 0, flags: 0, duplicates: 0 });
    }

    const medianPrice = targets.map(t => t.priceCents).sort((a, b) => a - b)[Math.floor(targets.length / 2)];
    let totalFlags = 0;
    let totalDuplicates = 0;

    for (const target of targets) {
      const result = autoCleanseRecord(target, targets, medianPrice);

      for (const flag of result.flags) {
        await cleansingRepo.createFlag({
          recordType: 'offering', recordId: target.id,
          field: flag.field, issue: flag.issue, detail: flag.detail,
        });
        totalFlags++;
      }

      for (const dup of result.duplicateCandidates) {
        await cleansingRepo.createCandidate({
          recordType: 'offering', recordAId: target.id, recordBId: dup.existingId,
          similarityScore: dup.score, featureScores: dup.featureScores,
        });
        totalDuplicates++;
      }
    }

    request.auditContext = {
      resourceType: 'import',
      action: 'internal_feed_cleanse',
      afterState: { orgId: body.orgId, cleansed: targets.length, flags: totalFlags, duplicates: totalDuplicates },
    };

    return reply.status(200).send({
      cleansed: targets.length,
      flags: totalFlags,
      duplicates: totalDuplicates,
    });
  });
}
