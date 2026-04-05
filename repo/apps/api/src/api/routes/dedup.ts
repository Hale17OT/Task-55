import { FastifyInstance } from 'fastify';
import { DrizzleCleansingRepository } from '../../infrastructure/persistence/cleansing-repository';
import { DrizzleOfferingRepository } from '../../infrastructure/persistence/offering-repository';
import { DrizzlePortfolioRepository } from '../../infrastructure/persistence/portfolio-repository';

export default async function dedupRoutes(fastify: FastifyInstance) {
  const cleansingRepo = new DrizzleCleansingRepository(fastify.db);
  const offeringRepo = new DrizzleOfferingRepository(fastify.db);
  const portfolioRepo = new DrizzlePortfolioRepository(fastify.db);

  // Helper: resolve the orgId for a record by type
  async function getRecordOrgId(recordType: string, recordId: string): Promise<string | null> {
    if (recordType === 'offering') {
      const record = await offeringRepo.findById(recordId);
      return record?.orgId ?? null;
    }
    if (recordType === 'portfolio_item') {
      const record = await portfolioRepo.findById(recordId);
      return record?.originalOrgId ?? null;
    }
    return null;
  }

  // Helper: check if BOTH of a candidate's records are within the user's org scope
  async function isCandidateInOrgScope(candidate: { recordType: string; recordAId: string; recordBId: string }, orgScope: string[]): Promise<boolean> {
    const orgA = await getRecordOrgId(candidate.recordType, candidate.recordAId);
    if (!orgA || !orgScope.includes(orgA)) return false;
    const orgB = await getRecordOrgId(candidate.recordType, candidate.recordBId);
    if (!orgB || !orgScope.includes(orgB)) return false;
    return true;
  }

  // GET /dedup/queue
  fastify.get('/queue', {
    preHandler: [fastify.authenticate, fastify.authorize('dedup', 'review')],
  }, async (request, reply) => {
    const query = request.query as { status?: string; recordType?: string; page?: string; limit?: string };
    const page = Math.max(1, parseInt(query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || '20', 10)));

    // Org scope applied at DB query level (before pagination)
    const orgScope = request.user.role === 'administrator' ? undefined : (request.authContext?.orgScope ?? []);

    const result = await cleansingRepo.listCandidates({
      status: query.status || 'pending',
      recordType: query.recordType,
      orgScope,
      page,
      limit,
    });

    return reply.status(200).send({
      data: result.data,
      meta: { page, limit, total: result.total, totalPages: Math.ceil(result.total / limit) || 1 },
    });
  });

  // GET /dedup/:candidateId
  fastify.get('/:candidateId', {
    preHandler: [fastify.authenticate, fastify.authorize('dedup', 'review')],
  }, async (request, reply) => {
    const { candidateId } = request.params as { candidateId: string };
    const candidate = await cleansingRepo.findCandidateById(candidateId);
    if (!candidate) {
      return reply.status(404).send({ error: 'DUPLICATE_CANDIDATE_NOT_FOUND', message: 'Candidate not found' });
    }

    // Org-scope check for non-admin users (all record types)
    if (request.user.role !== 'administrator') {
      const orgScope = request.authContext?.orgScope ?? [];
      if (!(await isCandidateInOrgScope(candidate, orgScope))) {
        return reply.status(404).send({ error: 'DUPLICATE_CANDIDATE_NOT_FOUND', message: 'Candidate not found' });
      }
    }

    // Load both records for side-by-side comparison
    let recordA = null;
    let recordB = null;
    if (candidate.recordType === 'offering') {
      recordA = await offeringRepo.findByIdWithAddons(candidate.recordAId);
      recordB = await offeringRepo.findByIdWithAddons(candidate.recordBId);
    } else if (candidate.recordType === 'portfolio_item') {
      recordA = await portfolioRepo.findById(candidate.recordAId);
      recordB = await portfolioRepo.findById(candidate.recordBId);
    }

    return reply.status(200).send({ candidate, recordA, recordB });
  });

  // POST /dedup/:candidateId/merge
  fastify.post('/:candidateId/merge', {
    preHandler: [fastify.authenticate, fastify.authorize('dedup', 'merge')],
  }, async (request, reply) => {
    const { candidateId } = request.params as { candidateId: string };
    const { survivingRecordId, mergedRecordId } = request.body as { survivingRecordId: string; mergedRecordId: string };

    if (!survivingRecordId || !mergedRecordId) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', message: 'survivingRecordId and mergedRecordId are required' });
    }

    if (survivingRecordId === mergedRecordId) {
      return reply.status(422).send({ error: 'SELF_MERGE_NOT_ALLOWED', message: 'Cannot merge a record with itself' });
    }

    const candidate = await cleansingRepo.findCandidateById(candidateId);
    if (!candidate) {
      return reply.status(404).send({ error: 'DUPLICATE_CANDIDATE_NOT_FOUND', message: 'Candidate not found' });
    }

    if (candidate.status !== 'pending') {
      return reply.status(409).send({ error: 'CANDIDATE_ALREADY_RESOLVED', message: `Candidate is already ${candidate.status}`, currentStatus: candidate.status });
    }

    // Enforce that merge targets match the candidate's actual record pair
    const validPair = (survivingRecordId === candidate.recordAId && mergedRecordId === candidate.recordBId)
      || (survivingRecordId === candidate.recordBId && mergedRecordId === candidate.recordAId);
    if (!validPair) {
      return reply.status(422).send({
        error: 'MERGE_TARGET_MISMATCH',
        message: 'survivingRecordId and mergedRecordId must match the candidate record pair',
        expected: { recordAId: candidate.recordAId, recordBId: candidate.recordBId },
      });
    }

    // Org-scope check for non-admin users
    if (request.user.role !== 'administrator') {
      const orgScope = request.authContext?.orgScope ?? [];
      if (!(await isCandidateInOrgScope(candidate, orgScope))) {
        return reply.status(404).send({ error: 'DUPLICATE_CANDIDATE_NOT_FOUND', message: 'Candidate not found' });
      }
    }

    // Verify records exist and belong to same org
    if (candidate.recordType === 'offering') {
      const recordA = await offeringRepo.findById(survivingRecordId);
      const recordB = await offeringRepo.findById(mergedRecordId);

      if (!recordA || !recordB) {
        return reply.status(404).send({ error: 'RECORD_NOT_FOUND', message: 'One or both records not found' });
      }

      if (recordA.orgId !== recordB.orgId) {
        return reply.status(422).send({ error: 'ORG_MISMATCH', message: 'Records belong to different organizations' });
      }

      // Build provenance
      const provenance = {
        original_creators: [
          { user_id: recordB.merchantId, created_at: recordB.createdAt, org_id: recordB.orgId },
        ],
        merge_chain: [{
          merged_id: mergedRecordId,
          surviving_id: survivingRecordId,
          merged_by: request.user.sub,
          merged_at: new Date().toISOString(),
        }],
        snapshot: recordB,
      };

      // Record merge history
      await cleansingRepo.createMergeHistory({
        duplicateCandidateId: candidateId,
        survivingId: survivingRecordId,
        mergedId: mergedRecordId,
        provenance,
        performedBy: request.user.sub,
      });

      // Soft-delete the merged offering (archive it)
      await offeringRepo.updateStatus(mergedRecordId, 'archived');
    } else if (candidate.recordType === 'portfolio_item') {
      const recordA = await portfolioRepo.findById(survivingRecordId);
      const recordB = await portfolioRepo.findById(mergedRecordId);

      if (!recordA || !recordB) {
        return reply.status(404).send({ error: 'RECORD_NOT_FOUND', message: 'One or both records not found' });
      }

      if (recordA.originalOrgId !== recordB.originalOrgId) {
        return reply.status(422).send({ error: 'ORG_MISMATCH', message: 'Records belong to different organizations' });
      }

      // Build provenance
      const provenance = {
        original_creators: [
          { user_id: recordB.merchantId, created_at: recordB.createdAt, org_id: recordB.originalOrgId },
        ],
        merge_chain: [{
          merged_id: mergedRecordId,
          surviving_id: survivingRecordId,
          merged_by: request.user.sub,
          merged_at: new Date().toISOString(),
        }],
        snapshot: recordB,
      };

      // Record merge history
      await cleansingRepo.createMergeHistory({
        duplicateCandidateId: candidateId,
        survivingId: survivingRecordId,
        mergedId: mergedRecordId,
        provenance,
        performedBy: request.user.sub,
      });

      // Soft-delete the merged portfolio item
      await portfolioRepo.softDelete(mergedRecordId);
    } else {
      return reply.status(422).send({ error: 'UNSUPPORTED_RECORD_TYPE', message: `Merge not supported for record type: ${candidate.recordType}` });
    }

    // Update candidate status
    await cleansingRepo.updateCandidateStatus(candidateId, 'merged', request.user.sub);

    request.auditContext = {
      resourceType: 'duplicate_candidate',
      resourceId: candidateId,
      afterState: { status: 'merged', survivingRecordId, mergedRecordId },
    };
    await request.writeAudit();

    return reply.status(200).send({
      candidateId,
      status: 'merged',
      survivingRecordId,
      mergedRecordId,
    });
  });

  // POST /dedup/:candidateId/dismiss
  fastify.post('/:candidateId/dismiss', {
    preHandler: [fastify.authenticate, fastify.authorize('dedup', 'review')],
  }, async (request, reply) => {
    const { candidateId } = request.params as { candidateId: string };

    const candidate = await cleansingRepo.findCandidateById(candidateId);
    if (!candidate) {
      return reply.status(404).send({ error: 'DUPLICATE_CANDIDATE_NOT_FOUND', message: 'Candidate not found' });
    }

    // Org-scope check for non-admin users
    if (request.user.role !== 'administrator') {
      const orgScope = request.authContext?.orgScope ?? [];
      if (!(await isCandidateInOrgScope(candidate, orgScope))) {
        return reply.status(404).send({ error: 'DUPLICATE_CANDIDATE_NOT_FOUND', message: 'Candidate not found' });
      }
    }

    if (candidate.status !== 'pending') {
      return reply.status(409).send({ error: 'CANDIDATE_ALREADY_RESOLVED', message: `Candidate is already ${candidate.status}`, currentStatus: candidate.status });
    }

    await cleansingRepo.updateCandidateStatus(candidateId, 'dismissed', request.user.sub);

    request.auditContext = {
      resourceType: 'duplicate_candidate',
      resourceId: candidateId,
      afterState: { status: 'dismissed' },
    };
    await request.writeAudit();

    return reply.status(200).send({ candidateId, status: 'dismissed' });
  });

  // Helper: check if a data-quality flag's record is within org scope
  async function isFlagInOrgScope(flag: { recordType: string; recordId: string }, orgScope: string[]): Promise<boolean> {
    const orgId = await getRecordOrgId(flag.recordType, flag.recordId);
    if (!orgId) return false;
    return orgScope.includes(orgId);
  }

  // GET /data-quality/flags
  fastify.get('/data-quality/flags', {
    preHandler: [fastify.authenticate, fastify.authorize('data_quality', 'review')],
  }, async (request, reply) => {
    const query = request.query as { status?: string; recordType?: string; page?: string; limit?: string };
    const page = Math.max(1, parseInt(query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || '20', 10)));

    // Org scope applied at DB query level (before pagination)
    const orgScope = request.user.role === 'administrator' ? undefined : (request.authContext?.orgScope ?? []);

    const result = await cleansingRepo.listFlags({
      status: query.status || 'open',
      recordType: query.recordType,
      orgScope,
      page,
      limit,
    });

    return reply.status(200).send({
      data: result.data,
      meta: { page, limit, total: result.total, totalPages: Math.ceil(result.total / limit) || 1 },
    });
  });

  // POST /data-quality/flags/:id/resolve
  fastify.post('/data-quality/flags/:id/resolve', {
    preHandler: [fastify.authenticate, fastify.authorize('data_quality', 'resolve')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    // Org-scope check for non-admin users
    if (request.user.role !== 'administrator') {
      const flag = await cleansingRepo.findFlagById(id);
      if (flag) {
        const orgScope = request.authContext?.orgScope ?? [];
        if (!(await isFlagInOrgScope(flag, orgScope))) {
          return reply.status(404).send({ error: 'FLAG_NOT_FOUND', message: 'Flag not found' });
        }
      }
    }

    // Verify flag exists before resolving
    const existingFlag = await cleansingRepo.findFlagById(id);
    if (!existingFlag) {
      return reply.status(404).send({ error: 'FLAG_NOT_FOUND', message: 'Flag not found' });
    }

    await cleansingRepo.resolveFlag(id, request.user.sub);
    request.auditContext = { resourceType: 'data_quality_flag', resourceId: id, action: 'flag.resolve' };
    await request.writeAudit();
    return reply.status(200).send({ id, status: 'resolved' });
  });
}
