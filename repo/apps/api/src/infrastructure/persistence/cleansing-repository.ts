import { eq, and, desc, count, inArray, sql } from 'drizzle-orm';
import { duplicateCandidates, mergeHistory, dataQualityFlags, offerings, portfolioItems } from '@studioops/db/schema';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
type Database = PostgresJsDatabase<any>;

export interface DuplicateCandidateRecord {
  id: string;
  recordType: string;
  recordAId: string;
  recordBId: string;
  similarityScore: string;
  featureScores: unknown;
  status: string;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
}

export class DrizzleCleansingRepository {
  constructor(private db: Database) {}

  async createCandidate(data: {
    recordType: string;
    recordAId: string;
    recordBId: string;
    similarityScore: number;
    featureScores: unknown;
  }): Promise<DuplicateCandidateRecord> {
    const [row] = await this.db.insert(duplicateCandidates).values({
      recordType: data.recordType,
      recordAId: data.recordAId,
      recordBId: data.recordBId,
      similarityScore: data.similarityScore.toFixed(4),
      featureScores: data.featureScores,
    }).returning();
    return this.toCandidateRecord(row);
  }

  async findCandidateById(id: string): Promise<DuplicateCandidateRecord | null> {
    const rows = await this.db.select().from(duplicateCandidates)
      .where(eq(duplicateCandidates.id, id)).limit(1);
    return rows[0] ? this.toCandidateRecord(rows[0]) : null;
  }

  async listCandidates(params: {
    status?: string;
    recordType?: string;
    orgScope?: string[];
    page: number;
    limit: number;
  }): Promise<{ data: DuplicateCandidateRecord[]; total: number }> {
    const conditions: any[] = [];
    if (params.status) conditions.push(eq(duplicateCandidates.status, params.status as any));
    if (params.recordType) conditions.push(eq(duplicateCandidates.recordType, params.recordType));

    // Apply org-scope at query level: BOTH recordAId AND recordBId must belong to in-scope orgs
    if (params.orgScope !== undefined) {
      if (params.orgScope.length === 0) {
        conditions.push(sql`false`);
      } else {
        const scopedIds = sql`(SELECT id FROM offerings WHERE org_id = ANY(${params.orgScope}) UNION ALL SELECT id FROM portfolio_items WHERE original_org_id = ANY(${params.orgScope}))`;
        conditions.push(sql`(${duplicateCandidates.recordAId} IN ${scopedIds} AND ${duplicateCandidates.recordBId} IN ${scopedIds})`);
      }
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const offset = (params.page - 1) * params.limit;

    const [totalResult] = await this.db.select({ count: count() }).from(duplicateCandidates).where(where);
    const total = totalResult?.count ?? 0;

    const rows = await this.db.select().from(duplicateCandidates)
      .where(where)
      .orderBy(desc(duplicateCandidates.createdAt))
      .limit(params.limit)
      .offset(offset);

    return { data: rows.map(this.toCandidateRecord), total };
  }

  async updateCandidateStatus(id: string, status: string, reviewedBy: string): Promise<void> {
    await this.db.update(duplicateCandidates).set({
      status: status as any,
      reviewedBy,
      reviewedAt: new Date(),
    }).where(eq(duplicateCandidates.id, id));
  }

  async createMergeHistory(data: {
    duplicateCandidateId: string;
    survivingId: string;
    mergedId: string;
    provenance: unknown;
    performedBy: string;
  }): Promise<void> {
    await this.db.insert(mergeHistory).values({
      duplicateCandidateId: data.duplicateCandidateId,
      survivingId: data.survivingId,
      mergedId: data.mergedId,
      provenance: data.provenance,
      performedBy: data.performedBy,
    });
  }

  async createFlag(data: {
    recordType: string;
    recordId: string;
    field: string;
    issue: string;
    detail?: unknown;
  }): Promise<void> {
    await this.db.insert(dataQualityFlags).values({
      recordType: data.recordType,
      recordId: data.recordId,
      field: data.field,
      issue: data.issue,
      detail: data.detail || null,
    });
  }

  async listFlags(params: {
    status?: string;
    recordType?: string;
    orgScope?: string[];
    page: number;
    limit: number;
  }): Promise<{ data: any[]; total: number }> {
    const conditions: any[] = [];
    if (params.status) conditions.push(eq(dataQualityFlags.status, params.status));
    if (params.recordType) conditions.push(eq(dataQualityFlags.recordType, params.recordType));

    // Apply org-scope at query level
    if (params.orgScope !== undefined) {
      if (params.orgScope.length === 0) {
        conditions.push(sql`false`);
      } else {
        const offeringIds = sql`(SELECT id FROM offerings WHERE org_id = ANY(${params.orgScope}))`;
        const portfolioIds = sql`(SELECT id FROM portfolio_items WHERE original_org_id = ANY(${params.orgScope}))`;
        conditions.push(sql`(${dataQualityFlags.recordId} IN ${offeringIds} OR ${dataQualityFlags.recordId} IN ${portfolioIds})`);
      }
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const offset = (params.page - 1) * params.limit;

    const [totalResult] = await this.db.select({ count: count() }).from(dataQualityFlags).where(where);
    const total = totalResult?.count ?? 0;

    const rows = await this.db.select().from(dataQualityFlags)
      .where(where)
      .orderBy(desc(dataQualityFlags.createdAt))
      .limit(params.limit)
      .offset(offset);

    return { data: rows, total };
  }

  async findFlagById(id: string): Promise<{ id: string; recordType: string; recordId: string } | null> {
    const rows = await this.db.select().from(dataQualityFlags)
      .where(eq(dataQualityFlags.id, id)).limit(1);
    return rows[0] ? { id: rows[0].id, recordType: rows[0].recordType, recordId: rows[0].recordId } : null;
  }

  async resolveFlag(id: string, resolvedBy: string): Promise<void> {
    await this.db.update(dataQualityFlags).set({
      status: 'resolved',
      resolvedBy,
      resolvedAt: new Date(),
    }).where(eq(dataQualityFlags.id, id));
  }

  private toCandidateRecord(row: typeof duplicateCandidates.$inferSelect): DuplicateCandidateRecord {
    return {
      id: row.id,
      recordType: row.recordType,
      recordAId: row.recordAId,
      recordBId: row.recordBId,
      similarityScore: row.similarityScore,
      featureScores: row.featureScores,
      status: row.status,
      reviewedBy: row.reviewedBy,
      reviewedAt: row.reviewedAt,
      createdAt: row.createdAt,
    };
  }
}
