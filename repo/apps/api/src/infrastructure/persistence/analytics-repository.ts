import { eq, and, gte, lte, inArray, desc, sql } from 'drizzle-orm';
import { events, registrations, analyticsSnapshots } from '@studioops/db/schema';
import { safeRatio, computeFilterHash, type DashboardFilters, type DashboardPayload } from '../../core/domain/analytics';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
type Database = PostgresJsDatabase<any>;

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

export class DrizzleAnalyticsRepository {
  constructor(private db: Database) {}

  async getDashboard(filters: DashboardFilters, orgScope?: string[]): Promise<DashboardPayload> {
    const filterHash = computeFilterHash(filters, orgScope);

    // Check cache (partitioned by org scope via hash)
    const cached = await this.db.select().from(analyticsSnapshots)
      .where(and(
        eq(analyticsSnapshots.filterHash, filterHash),
        eq(analyticsSnapshots.snapshotType, 'dashboard'),
      ))
      .orderBy(desc(analyticsSnapshots.createdAt))
      .limit(1);

    if (cached.length > 0) {
      const age = Date.now() - cached[0].createdAt.getTime();
      if (age < CACHE_TTL_MS) {
        return cached[0].payload as DashboardPayload;
      }
    }

    // Compute fresh metrics
    const payload = await this.computeMetrics(filters, orgScope);

    // Cache the snapshot
    await this.db.insert(analyticsSnapshots).values({
      snapshotType: 'dashboard',
      filterHash,
      payload,
      periodStart: filters.from,
      periodEnd: filters.to,
    });

    return payload;
  }

  private async computeMetrics(filters: DashboardFilters, orgScope?: string[]): Promise<DashboardPayload> {
    const eventConditions: any[] = [
      gte(events.scheduledAt, filters.from),
      lte(events.scheduledAt, filters.to),
    ];

    if (filters.orgId) {
      eventConditions.push(eq(events.orgId, filters.orgId));
    } else if (orgScope !== undefined) {
      // orgScope is defined = non-admin user; enforce even if empty (empty = zero results)
      if (orgScope.length > 0) {
        eventConditions.push(inArray(events.orgId, orgScope));
      } else {
        // Empty org scope: user has no assigned orgs → return nothing
        eventConditions.push(sql`false`);
      }
    }
    // orgScope === undefined = admin: no org filter (sees all)

    if (filters.eventType) {
      eventConditions.push(eq(events.eventType, filters.eventType));
    }

    const eventWhere = and(...eventConditions);

    // 1. Event popularity by type
    const popularityRows = await this.db
      .select({ eventType: events.eventType, count: sql<number>`count(*)::int` })
      .from(events)
      .where(eventWhere)
      .groupBy(events.eventType)
      .orderBy(sql`count(*) DESC`);

    // 2. Get all event IDs in range for registration queries
    const eventIds = await this.db.select({ id: events.id }).from(events).where(eventWhere);
    const ids = eventIds.map(e => e.id);

    let conversionFunnel = { stages: ['registered', 'confirmed', 'attended'], counts: [0, 0, 0] };
    let attendanceRateData = { labels: ['Attended', 'No-Show'], rates: [0, 0] };
    let cancellationRateData = { labels: ['Active', 'Cancelled'], rates: [0, 0] };

    if (ids.length > 0) {
      // 3. Registration funnel
      const regCounts = await this.db
        .select({ status: registrations.status, count: sql<number>`count(*)::int` })
        .from(registrations)
        .where(inArray(registrations.eventId, ids))
        .groupBy(registrations.status);

      const statusMap = new Map(regCounts.map(r => [r.status, r.count]));
      const totalRegs = Array.from(statusMap.values()).reduce((a, b) => a + b, 0);
      const confirmed = (statusMap.get('confirmed') ?? 0) + (statusMap.get('attended') ?? 0) + (statusMap.get('no_show') ?? 0);
      const attended = statusMap.get('attended') ?? 0;
      const cancelled = statusMap.get('cancelled') ?? 0;
      const noShow = statusMap.get('no_show') ?? 0;

      conversionFunnel = {
        stages: ['registered', 'confirmed', 'attended'],
        counts: [totalRegs, confirmed, attended],
      };

      attendanceRateData = {
        labels: ['Attended', 'No-Show'],
        rates: [
          safeRatio(attended, confirmed),
          safeRatio(noShow, confirmed),
        ],
      };

      cancellationRateData = {
        labels: ['Active', 'Cancelled'],
        rates: [
          safeRatio(totalRegs - cancelled, totalRegs),
          safeRatio(cancelled, totalRegs),
        ],
      };
    }

    // 4. Channel distribution
    const channelRows = await this.db
      .select({ channel: events.channel, count: sql<number>`count(*)::int` })
      .from(events)
      .where(eventWhere)
      .groupBy(events.channel)
      .orderBy(sql`count(*) DESC`);

    // 5. Tag distribution — enforces same org scope as all other queries
    let tagRows: any[] = [];
    try {
      if (filters.orgId) {
        tagRows = await this.db.execute(
          sql`SELECT unnest(tags) as tag, count(*)::int as count FROM events WHERE scheduled_at >= ${filters.from} AND scheduled_at <= ${filters.to} AND org_id = ${filters.orgId} GROUP BY tag ORDER BY count DESC LIMIT 20`,
        ) as any[];
      } else if (orgScope !== undefined) {
        if (orgScope.length > 0) {
          tagRows = await this.db.execute(
            sql`SELECT unnest(tags) as tag, count(*)::int as count FROM events WHERE scheduled_at >= ${filters.from} AND scheduled_at <= ${filters.to} AND org_id = ANY(${orgScope}) GROUP BY tag ORDER BY count DESC LIMIT 20`,
          ) as any[];
        }
        // else: empty orgScope = zero results (tagRows stays empty)
      } else {
        // orgScope undefined = admin: no org filter
        tagRows = await this.db.execute(
          sql`SELECT unnest(tags) as tag, count(*)::int as count FROM events WHERE scheduled_at >= ${filters.from} AND scheduled_at <= ${filters.to} GROUP BY tag ORDER BY count DESC LIMIT 20`,
        ) as any[];
      }
    } catch {
      tagRows = [];
    }

    return {
      generatedAt: new Date().toISOString(),
      filters: {
        from: filters.from.toISOString(),
        to: filters.to.toISOString(),
        orgId: filters.orgId,
        eventType: filters.eventType,
      },
      popularity: {
        labels: popularityRows.map(r => r.eventType),
        data: popularityRows.map(r => r.count),
      },
      conversionFunnel,
      attendanceRate: attendanceRateData,
      cancellationRate: cancellationRateData,
      channelDistribution: {
        labels: channelRows.map(r => r.channel),
        counts: channelRows.map(r => r.count),
      },
      tagDistribution: {
        labels: (tagRows as any[]).map(r => r.tag),
        counts: (tagRows as any[]).map(r => r.count),
      },
    };
  }
}
