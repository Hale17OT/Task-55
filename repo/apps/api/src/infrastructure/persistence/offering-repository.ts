import { eq, and, or, inArray, sql, desc, count } from 'drizzle-orm';
import { offerings, offeringAddons, offeringAccess } from '@studioops/db/schema';
import type {
  OfferingRepositoryPort,
  OfferingRecord,
  AddonRecord,
  OfferingWithAddons,
  ListOfferingsParams,
  PaginatedOfferings,
  CreateOfferingData,
  UpdateOfferingData,
} from '../../core/ports/offering-repository.port';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
type Database = PostgresJsDatabase<any>;

export class DrizzleOfferingRepository implements OfferingRepositoryPort {
  constructor(private db: Database) {}

  async create(data: CreateOfferingData): Promise<OfferingRecord> {
    const [row] = await this.db.insert(offerings).values({
      orgId: data.orgId,
      merchantId: data.merchantId,
      title: data.title,
      description: data.description || null,
      basePriceCents: data.basePriceCents,
      durationMinutes: data.durationMinutes,
      tags: data.tags || [],
      visibility: data.visibility,
      status: 'draft',
    }).returning();
    return this.toRecord(row);
  }

  async findById(id: string): Promise<OfferingRecord | null> {
    const rows = await this.db.select().from(offerings).where(eq(offerings.id, id)).limit(1);
    return rows[0] ? this.toRecord(rows[0]) : null;
  }

  async findByIdWithAddons(id: string): Promise<OfferingWithAddons | null> {
    const offering = await this.findById(id);
    if (!offering) return null;

    const addons = await this.db.select().from(offeringAddons)
      .where(eq(offeringAddons.offeringId, id));

    const access = await this.db.select().from(offeringAccess)
      .where(eq(offeringAccess.offeringId, id));

    return {
      ...offering,
      addons: addons.map(this.toAddonRecord),
      access: access.map(a => ({ userId: a.userId, grantedBy: a.grantedBy })),
    };
  }

  async list(params: ListOfferingsParams): Promise<PaginatedOfferings> {
    const { page, limit, orgId, status, role, userId, orgScope } = params;
    const offset = (page - 1) * limit;

    const conditions: any[] = [];

    // Status filter
    if (status) {
      conditions.push(eq(offerings.status, status));
    }

    // Org filter
    if (orgId) {
      conditions.push(eq(offerings.orgId, orgId));
    }

    // Visibility filtering based on role
    switch (role) {
      case 'administrator':
        // Admin sees everything
        break;
      case 'operations':
        // Ops sees all visibilities but scoped to their orgs
        if (orgScope && orgScope.length > 0) {
          conditions.push(inArray(offerings.orgId, orgScope));
        } else if (orgScope !== undefined) {
          conditions.push(sql`false`); // empty scope = no access
        }
        break;
      case 'merchant':
        // Merchant sees: own items (any status) + other public active offerings
        if (userId) {
          conditions.push(
            or(
              eq(offerings.merchantId, userId),
              and(eq(offerings.visibility, 'public'), eq(offerings.status, 'active')),
            )!,
          );
        }
        break;
      case 'client':
        // Client sees: public+active within their orgs, OR restricted items they have explicit access to
        if (!status) {
          conditions.push(eq(offerings.status, 'active'));
        }
        if (orgScope && orgScope.length > 0) {
          conditions.push(inArray(offerings.orgId, orgScope));
        } else if (orgScope !== undefined) {
          conditions.push(sql`false`);
        }
        if (userId) {
          // Subquery: offering IDs the client has been granted access to
          const grantedSubquery = sql`(SELECT offering_id FROM offering_access WHERE user_id = ${userId})`;
          conditions.push(
            or(
              eq(offerings.visibility, 'public'),
              and(eq(offerings.visibility, 'restricted'), sql`${offerings.id} IN ${grantedSubquery}`),
            )!,
          );
        } else {
          conditions.push(eq(offerings.visibility, 'public'));
        }
        break;
      case 'guest':
      default:
        // Guest: public + active only
        conditions.push(eq(offerings.visibility, 'public'));
        if (!status) {
          conditions.push(eq(offerings.status, 'active'));
        }
        break;
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalResult] = await this.db.select({ count: count() }).from(offerings).where(where);
    const total = totalResult?.count ?? 0;

    const rows = await this.db.select().from(offerings)
      .where(where)
      .orderBy(desc(offerings.createdAt))
      .limit(limit)
      .offset(offset);

    return {
      data: rows.map(this.toRecord),
      total,
    };
  }

  async update(id: string, data: UpdateOfferingData): Promise<OfferingRecord> {
    const updateData: any = { updatedAt: new Date() };
    if (data.title !== undefined) updateData.title = data.title;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.basePriceCents !== undefined) updateData.basePriceCents = data.basePriceCents;
    if (data.durationMinutes !== undefined) updateData.durationMinutes = data.durationMinutes;
    if (data.tags !== undefined) updateData.tags = data.tags;
    if (data.visibility !== undefined) updateData.visibility = data.visibility;

    const [row] = await this.db.update(offerings)
      .set(updateData)
      .where(eq(offerings.id, id))
      .returning();
    return this.toRecord(row);
  }

  async updateStatus(id: string, status: string, expectedCurrentStatus?: string): Promise<OfferingRecord | null> {
    const conditions = [eq(offerings.id, id)];
    if (expectedCurrentStatus) {
      conditions.push(eq(offerings.status, expectedCurrentStatus as any));
    }
    const rows = await this.db.update(offerings)
      .set({ status: status as any, updatedAt: new Date() })
      .where(and(...conditions))
      .returning();
    return rows[0] ? this.toRecord(rows[0]) : null;
  }

  async createAddon(offeringId: string, data: { name: string; priceCents: number; unitDescription: string }): Promise<AddonRecord> {
    const [row] = await this.db.insert(offeringAddons).values({
      offeringId,
      name: data.name,
      priceCents: data.priceCents,
      unitDescription: data.unitDescription,
    }).returning();
    return this.toAddonRecord(row);
  }

  async deleteAddon(addonId: string): Promise<void> {
    await this.db.delete(offeringAddons).where(eq(offeringAddons.id, addonId));
  }

  async findAddonById(addonId: string): Promise<AddonRecord | null> {
    const rows = await this.db.select().from(offeringAddons)
      .where(eq(offeringAddons.id, addonId)).limit(1);
    return rows[0] ? this.toAddonRecord(rows[0]) : null;
  }

  async grantAccess(offeringId: string, userIds: string[], grantedBy: string): Promise<number> {
    let granted = 0;
    for (const userId of userIds) {
      try {
        const rows = await this.db.insert(offeringAccess).values({
          offeringId,
          userId,
          grantedBy,
        }).onConflictDoNothing().returning({ id: offeringAccess.id });
        if (rows.length > 0) granted++;
      } catch {
        // Skip errors
      }
    }
    return granted;
  }

  async revokeAccess(offeringId: string, userId: string): Promise<void> {
    await this.db.delete(offeringAccess).where(
      and(eq(offeringAccess.offeringId, offeringId), eq(offeringAccess.userId, userId)),
    );
  }

  async hasAccess(offeringId: string, userId: string): Promise<boolean> {
    const rows = await this.db.select().from(offeringAccess)
      .where(and(eq(offeringAccess.offeringId, offeringId), eq(offeringAccess.userId, userId)))
      .limit(1);
    return rows.length > 0;
  }

  private toRecord(row: typeof offerings.$inferSelect): OfferingRecord {
    return {
      id: row.id,
      orgId: row.orgId,
      merchantId: row.merchantId,
      title: row.title,
      description: row.description,
      basePriceCents: row.basePriceCents,
      durationMinutes: row.durationMinutes,
      tags: row.tags ?? [],
      status: row.status,
      visibility: row.visibility,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private toAddonRecord(row: typeof offeringAddons.$inferSelect): AddonRecord {
    return {
      id: row.id,
      offeringId: row.offeringId,
      name: row.name,
      priceCents: row.priceCents,
      unitDescription: row.unitDescription,
      createdAt: row.createdAt,
    };
  }
}
