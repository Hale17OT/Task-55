import { eq, and, gte, lte, inArray, desc, count, sql } from 'drizzle-orm';
import { events, registrations } from '@studioops/db/schema';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { EventStatus, RegistrationStatus } from '@studioops/shared';
type Database = PostgresJsDatabase<any>;

export interface EventRecord {
  id: string;
  orgId: string;
  merchantId: string;
  offeringId: string | null;
  title: string;
  description: string | null;
  eventType: string;
  scheduledAt: Date;
  durationMinutes: number;
  status: EventStatus;
  channel: string;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface RegistrationRecord {
  id: string;
  eventId: string;
  clientId: string;
  status: RegistrationStatus;
  registeredAt: Date;
  confirmedAt: Date | null;
  arrivedAt: Date | null;
  cancelledAt: Date | null;
  cancelReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ListEventsParams {
  page: number;
  limit: number;
  orgId?: string;
  orgScope?: string[];
  eventType?: string;
  status?: EventStatus;
  from?: Date;
  to?: Date;
}

export class DrizzleEventRepository {
  constructor(private db: Database) {}

  async createEvent(data: {
    orgId: string;
    merchantId: string;
    offeringId?: string;
    title: string;
    description?: string;
    eventType: string;
    scheduledAt: Date;
    durationMinutes: number;
    channel: string;
    tags: string[];
  }): Promise<EventRecord> {
    const [row] = await this.db.insert(events).values({
      orgId: data.orgId,
      merchantId: data.merchantId,
      offeringId: data.offeringId || null,
      title: data.title,
      description: data.description || null,
      eventType: data.eventType,
      scheduledAt: data.scheduledAt,
      durationMinutes: data.durationMinutes,
      channel: data.channel,
      tags: data.tags,
    }).returning();
    return this.toEventRecord(row);
  }

  async findEventById(id: string): Promise<EventRecord | null> {
    const rows = await this.db.select().from(events).where(eq(events.id, id)).limit(1);
    return rows[0] ? this.toEventRecord(rows[0]) : null;
  }

  async updateEvent(id: string, data: Partial<{
    title: string;
    description: string;
    eventType: string;
    scheduledAt: Date;
    durationMinutes: number;
    channel: string;
    tags: string[];
  }>): Promise<EventRecord> {
    const updateData: any = { updatedAt: new Date() };
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) updateData[key] = value;
    }
    const [row] = await this.db.update(events).set(updateData).where(eq(events.id, id)).returning();
    return this.toEventRecord(row);
  }

  async updateEventStatus(id: string, status: EventStatus): Promise<EventRecord> {
    const [row] = await this.db.update(events)
      .set({ status, updatedAt: new Date() })
      .where(eq(events.id, id))
      .returning();
    return this.toEventRecord(row);
  }

  async listEvents(params: ListEventsParams): Promise<{ data: EventRecord[]; total: number }> {
    const { page, limit, orgId, orgScope, eventType, status, from, to } = params;
    const offset = (page - 1) * limit;
    const conditions: any[] = [];

    if (orgId) conditions.push(eq(events.orgId, orgId));
    if (orgScope !== undefined) {
      if (orgScope.length > 0) conditions.push(inArray(events.orgId, orgScope));
      else conditions.push(sql`false`); // empty scope = no access
    }
    if (eventType) conditions.push(eq(events.eventType, eventType));
    if (status) conditions.push(eq(events.status, status));
    if (from) conditions.push(gte(events.scheduledAt, from));
    if (to) conditions.push(lte(events.scheduledAt, to));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalResult] = await this.db.select({ count: count() }).from(events).where(where);
    const total = totalResult?.count ?? 0;

    const rows = await this.db.select().from(events)
      .where(where)
      .orderBy(desc(events.scheduledAt))
      .limit(limit)
      .offset(offset);

    return { data: rows.map(this.toEventRecord), total };
  }

  async createRegistration(data: { eventId: string; clientId: string }): Promise<RegistrationRecord> {
    const [row] = await this.db.insert(registrations).values({
      eventId: data.eventId,
      clientId: data.clientId,
    }).returning();
    return this.toRegistrationRecord(row);
  }

  async findRegistrationById(id: string): Promise<RegistrationRecord | null> {
    const rows = await this.db.select().from(registrations).where(eq(registrations.id, id)).limit(1);
    return rows[0] ? this.toRegistrationRecord(rows[0]) : null;
  }

  async updateRegistrationStatus(id: string, status: RegistrationStatus, extras?: {
    confirmedAt?: Date;
    arrivedAt?: Date;
    cancelledAt?: Date;
    cancelReason?: string;
  }): Promise<RegistrationRecord> {
    const updateData: any = { status, updatedAt: new Date() };
    if (extras?.confirmedAt) updateData.confirmedAt = extras.confirmedAt;
    if (extras?.arrivedAt) updateData.arrivedAt = extras.arrivedAt;
    if (extras?.cancelledAt) updateData.cancelledAt = extras.cancelledAt;
    if (extras?.cancelReason) updateData.cancelReason = extras.cancelReason;

    const [row] = await this.db.update(registrations)
      .set(updateData)
      .where(eq(registrations.id, id))
      .returning();
    return this.toRegistrationRecord(row);
  }

  async listRegistrations(eventId: string, page: number, limit: number, clientId?: string): Promise<{ data: RegistrationRecord[]; total: number }> {
    const offset = (page - 1) * limit;
    const conditions = [eq(registrations.eventId, eventId)];
    if (clientId) {
      conditions.push(eq(registrations.clientId, clientId));
    }
    const where = and(...conditions);

    const [totalResult] = await this.db.select({ count: count() }).from(registrations).where(where);
    const total = totalResult?.count ?? 0;

    const rows = await this.db.select().from(registrations)
      .where(where)
      .orderBy(desc(registrations.registeredAt))
      .limit(limit)
      .offset(offset);

    return { data: rows.map(this.toRegistrationRecord), total };
  }

  private toEventRecord(row: typeof events.$inferSelect): EventRecord {
    return {
      id: row.id,
      orgId: row.orgId,
      merchantId: row.merchantId,
      offeringId: row.offeringId,
      title: row.title,
      description: row.description,
      eventType: row.eventType,
      scheduledAt: row.scheduledAt,
      durationMinutes: row.durationMinutes,
      status: row.status,
      channel: row.channel,
      tags: row.tags ?? [],
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private toRegistrationRecord(row: typeof registrations.$inferSelect): RegistrationRecord {
    return {
      id: row.id,
      eventId: row.eventId,
      clientId: row.clientId,
      status: row.status,
      registeredAt: row.registeredAt,
      confirmedAt: row.confirmedAt,
      arrivedAt: row.arrivedAt,
      cancelledAt: row.cancelledAt,
      cancelReason: row.cancelReason,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
