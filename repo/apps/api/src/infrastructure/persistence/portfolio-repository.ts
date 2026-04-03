import { eq, and, isNull, inArray, desc, count, sql } from 'drizzle-orm';
import { portfolioItems, portfolioTags, portfolioItemTags, portfolioCategories } from '@studioops/db/schema';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { ProcessingStatus } from '../../core/domain/media-validation';
type Database = PostgresJsDatabase<any>;

export interface PortfolioItemRecord {
  id: string;
  merchantId: string;
  originalOrgId: string;
  categoryId: string | null;
  title: string;
  description: string | null;
  mediaType: 'photo' | 'video';
  status: ProcessingStatus;
  originalPath: string;
  processedPath: string | null;
  previewPath: string | null;
  mimeType: string;
  fileSizeBytes: number;
  width: number | null;
  height: number | null;
  widthInches: string | null;
  heightInches: string | null;
  durationSeconds: number | null;
  errorDetail: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TagRecord {
  id: string;
  name: string;
}

export class DrizzlePortfolioRepository {
  constructor(private db: Database) {}

  async createItem(data: {
    merchantId: string;
    originalOrgId: string;
    categoryId?: string;
    title: string;
    description?: string;
    mediaType: 'photo' | 'video';
    originalPath: string;
    mimeType: string;
    fileSizeBytes: number;
  }): Promise<PortfolioItemRecord> {
    const [row] = await this.db.insert(portfolioItems).values({
      merchantId: data.merchantId,
      originalOrgId: data.originalOrgId,
      categoryId: data.categoryId || null,
      title: data.title,
      description: data.description || null,
      mediaType: data.mediaType,
      originalPath: data.originalPath,
      mimeType: data.mimeType,
      fileSizeBytes: data.fileSizeBytes,
      status: 'pending',
    }).returning();
    return this.toRecord(row);
  }

  async findById(id: string): Promise<PortfolioItemRecord | null> {
    const rows = await this.db.select().from(portfolioItems)
      .where(and(eq(portfolioItems.id, id), isNull(portfolioItems.deletedAt)))
      .limit(1);
    return rows[0] ? this.toRecord(rows[0]) : null;
  }

  async updateProcessingResult(id: string, data: {
    status: ProcessingStatus;
    processedPath?: string;
    previewPath?: string;
    width?: number;
    height?: number;
    widthInches?: string;
    heightInches?: string;
    durationSeconds?: number;
    errorDetail?: string;
  }): Promise<void> {
    const updateData: any = { status: data.status, updatedAt: new Date() };
    if (data.processedPath) updateData.processedPath = data.processedPath;
    if (data.previewPath) updateData.previewPath = data.previewPath;
    if (data.width) updateData.width = data.width;
    if (data.height) updateData.height = data.height;
    if (data.widthInches) updateData.widthInches = data.widthInches;
    if (data.heightInches) updateData.heightInches = data.heightInches;
    if (data.durationSeconds) updateData.durationSeconds = data.durationSeconds;
    if (data.errorDetail) updateData.errorDetail = data.errorDetail;

    await this.db.update(portfolioItems).set(updateData).where(eq(portfolioItems.id, id));
  }

  async listItems(params: {
    merchantId?: string;
    orgScope?: string[];
    categoryId?: string;
    status?: string;
    page: number;
    limit: number;
  }): Promise<{ data: PortfolioItemRecord[]; total: number }> {
    const { page, limit, merchantId, orgScope, categoryId, status } = params;
    const offset = (page - 1) * limit;
    const conditions: any[] = [isNull(portfolioItems.deletedAt)];

    if (merchantId) conditions.push(eq(portfolioItems.merchantId, merchantId));
    if (orgScope !== undefined) {
      if (orgScope.length > 0) conditions.push(inArray(portfolioItems.originalOrgId, orgScope));
      else conditions.push(sql`false`); // empty scope = no access
    }
    if (categoryId) conditions.push(eq(portfolioItems.categoryId, categoryId));
    if (status) conditions.push(eq(portfolioItems.status, status as any));

    const where = and(...conditions);

    const [totalResult] = await this.db.select({ count: count() }).from(portfolioItems).where(where);
    const total = totalResult?.count ?? 0;

    const rows = await this.db.select().from(portfolioItems)
      .where(where)
      .orderBy(desc(portfolioItems.createdAt))
      .limit(limit)
      .offset(offset);

    return { data: rows.map(this.toRecord), total };
  }

  async softDelete(id: string): Promise<void> {
    await this.db.update(portfolioItems)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(portfolioItems.id, id));
  }

  async getOrCreateTag(name: string): Promise<TagRecord> {
    const normalized = name.trim().toLowerCase();
    const existing = await this.db.select().from(portfolioTags)
      .where(eq(portfolioTags.name, normalized)).limit(1);
    if (existing[0]) return existing[0];

    const [created] = await this.db.insert(portfolioTags)
      .values({ name: normalized })
      .onConflictDoNothing()
      .returning();
    if (created) return created;

    // Race condition: another insert won
    const [found] = await this.db.select().from(portfolioTags)
      .where(eq(portfolioTags.name, normalized)).limit(1);
    return found;
  }

  async setItemTags(itemId: string, tagIds: string[]): Promise<void> {
    // Delete existing tags
    await this.db.delete(portfolioItemTags).where(eq(portfolioItemTags.itemId, itemId));
    // Insert new ones
    if (tagIds.length > 0) {
      await this.db.insert(portfolioItemTags)
        .values(tagIds.map((tagId) => ({ itemId, tagId })))
        .onConflictDoNothing();
    }
  }

  async getItemTags(itemId: string): Promise<TagRecord[]> {
    const rows = await this.db.select({ id: portfolioTags.id, name: portfolioTags.name })
      .from(portfolioItemTags)
      .innerJoin(portfolioTags, eq(portfolioItemTags.tagId, portfolioTags.id))
      .where(eq(portfolioItemTags.itemId, itemId));
    return rows;
  }

  async listTags(search?: string): Promise<TagRecord[]> {
    if (search) {
      return this.db.select().from(portfolioTags)
        .where(sql`${portfolioTags.name} ILIKE ${'%' + search + '%'}`)
        .limit(50);
    }
    return this.db.select().from(portfolioTags).limit(100);
  }

  async listCategories(merchantId: string): Promise<Array<{ id: string; name: string; sortOrder: number }>> {
    return this.db.select().from(portfolioCategories)
      .where(eq(portfolioCategories.merchantId, merchantId))
      .orderBy(portfolioCategories.sortOrder);
  }

  async createCategory(merchantId: string, name: string, sortOrder: number): Promise<{ id: string; name: string; sortOrder: number }> {
    const [row] = await this.db.insert(portfolioCategories).values({ merchantId, name, sortOrder }).returning();
    return { id: row.id, name: row.name, sortOrder: row.sortOrder };
  }

  async updateCategory(categoryId: string, merchantId: string, data: { name?: string; sortOrder?: number }): Promise<{ id: string; name: string; sortOrder: number } | null> {
    const existing = await this.db.select().from(portfolioCategories)
      .where(and(eq(portfolioCategories.id, categoryId), eq(portfolioCategories.merchantId, merchantId))).limit(1);
    if (!existing[0]) return null;

    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.sortOrder !== undefined) updateData.sortOrder = data.sortOrder;

    const [row] = await this.db.update(portfolioCategories).set(updateData)
      .where(eq(portfolioCategories.id, categoryId)).returning();
    return { id: row.id, name: row.name, sortOrder: row.sortOrder };
  }

  async deleteCategory(categoryId: string, merchantId: string): Promise<void> {
    await this.db.delete(portfolioCategories)
      .where(and(eq(portfolioCategories.id, categoryId), eq(portfolioCategories.merchantId, merchantId)));
  }

  async updateItemCategory(itemId: string, categoryId: string | null): Promise<void> {
    await this.db.update(portfolioItems).set({ categoryId, updatedAt: new Date() })
      .where(eq(portfolioItems.id, itemId));
  }

  async countTodayUploads(merchantId: string): Promise<number> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [result] = await this.db.select({ count: count() }).from(portfolioItems)
      .where(and(
        eq(portfolioItems.merchantId, merchantId),
        sql`${portfolioItems.createdAt} >= ${startOfDay}`,
      ));
    return result?.count ?? 0;
  }

  private toRecord(row: typeof portfolioItems.$inferSelect): PortfolioItemRecord {
    return {
      id: row.id,
      merchantId: row.merchantId,
      originalOrgId: row.originalOrgId,
      categoryId: row.categoryId,
      title: row.title,
      description: row.description,
      mediaType: row.mediaType,
      status: row.status as ProcessingStatus,
      originalPath: row.originalPath,
      processedPath: row.processedPath,
      previewPath: row.previewPath,
      mimeType: row.mimeType,
      fileSizeBytes: row.fileSizeBytes,
      width: row.width,
      height: row.height,
      widthInches: row.widthInches,
      heightInches: row.heightInches,
      durationSeconds: row.durationSeconds,
      errorDetail: row.errorDetail,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
