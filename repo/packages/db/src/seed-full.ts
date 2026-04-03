import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, and, sql } from 'drizzle-orm';
import argon2 from 'argon2';
import * as schema from './schema/index';
import { seed as seedPermissions } from './seed';
import { applyAuditTriggers } from './apply-triggers';

async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 4 });
}

export async function seedFull(connectionString: string) {
  // First seed permissions and rules
  await seedPermissions(connectionString);

  // Apply audit immutability triggers
  await applyAuditTriggers(connectionString);

  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client, { schema });

  console.log('Seeding full dataset...');

  // Get org
  const [org] = await db.select().from(schema.organizations).where(eq(schema.organizations.slug, 'default-studio')).limit(1);
  const orgId = org.id;

  // Seed users
  const users = [
    { username: 'admin', password: 'AdminPass123!@', role: 'administrator' as const },
    { username: 'ops_user', password: 'OpsUserPass123!@', role: 'operations' as const },
    { username: 'merchant1', password: 'MerchantPass123!@', role: 'merchant' as const },
    { username: 'client1', password: 'ClientPass123!@', role: 'client' as const },
  ];

  for (const u of users) {
    const existing = await db.select().from(schema.users).where(eq(schema.users.username, u.username)).limit(1);
    if (existing.length > 0) {
      console.log(`  User '${u.username}' already exists`);
      continue;
    }

    const hash = await hashPassword(u.password);
    const [user] = await db.insert(schema.users).values({
      username: u.username,
      passwordHash: hash,
      role: u.role,
      orgId,
    }).returning();

    // Add to org
    await db.insert(schema.organizationMembers).values({
      orgId,
      userId: user.id,
      roleInOrg: u.role === 'administrator' ? 'owner' : 'member',
    }).onConflictDoNothing();

    console.log(`  Created user '${u.username}' (${u.role})`);
  }

  // Get merchant ID for sample data
  const [merchant] = await db.select().from(schema.users).where(eq(schema.users.username, 'merchant1')).limit(1);
  const [clientUser] = await db.select().from(schema.users).where(eq(schema.users.username, 'client1')).limit(1);

  // Seed sample offerings
  const offeringsData = [
    { title: 'Wedding Essentials', description: 'Full-day wedding coverage', basePriceCents: 250000, durationMinutes: 360, visibility: 'public' as const, status: 'active' as const },
    { title: 'Corporate Headshots', description: 'Professional headshot session', basePriceCents: 45000, durationMinutes: 90, visibility: 'public' as const, status: 'active' as const },
    { title: 'Portrait Session', description: 'Individual or family portraits', basePriceCents: 35000, durationMinutes: 60, visibility: 'public' as const, status: 'draft' as const },
  ];

  for (const o of offeringsData) {
    const existing = await db.select().from(schema.offerings).where(eq(schema.offerings.title, o.title)).limit(1);
    if (existing.length > 0) continue;

    const [offering] = await db.insert(schema.offerings).values({
      orgId,
      merchantId: merchant.id,
      title: o.title,
      description: o.description,
      basePriceCents: o.basePriceCents,
      durationMinutes: o.durationMinutes,
      visibility: o.visibility,
      status: o.status,
    }).returning();

    // Add addons to Wedding package
    if (o.title === 'Wedding Essentials') {
      await db.insert(schema.offeringAddons).values([
        { offeringId: offering.id, name: 'Extra Retouched Images', priceCents: 1500, unitDescription: 'each' },
        { offeringId: offering.id, name: 'Second Shooter', priceCents: 8000, unitDescription: 'per hour' },
      ]).onConflictDoNothing();
    }

    console.log(`  Created offering '${o.title}'`);
  }

  // Seed sample events
  const eventsData = [
    { title: 'Smith Wedding', eventType: 'wedding', scheduledAt: new Date('2026-06-15T10:00:00Z'), durationMinutes: 480, channel: 'referral', tags: ['wedding', 'outdoor'] },
    { title: 'Corp Headshot Day', eventType: 'corporate', scheduledAt: new Date('2026-06-20T09:00:00Z'), durationMinutes: 120, channel: 'website', tags: ['corporate', 'studio'] },
    { title: 'Johnson Family', eventType: 'portrait', scheduledAt: new Date('2026-07-01T14:00:00Z'), durationMinutes: 90, channel: 'walk-in', tags: ['portrait', 'family'] },
    { title: 'Lee Wedding', eventType: 'wedding', scheduledAt: new Date('2026-07-10T11:00:00Z'), durationMinutes: 360, channel: 'referral', tags: ['wedding', 'indoor'] },
    { title: 'Tech Corp Shots', eventType: 'corporate', scheduledAt: new Date('2026-07-15T09:00:00Z'), durationMinutes: 180, channel: 'website', tags: ['corporate', 'team'] },
  ];

  for (const e of eventsData) {
    const existing = await db.select().from(schema.events).where(eq(schema.events.title, e.title)).limit(1);
    if (existing.length > 0) continue;

    const [event] = await db.insert(schema.events).values({
      orgId,
      merchantId: merchant.id,
      title: e.title,
      eventType: e.eventType,
      scheduledAt: e.scheduledAt,
      durationMinutes: e.durationMinutes,
      channel: e.channel,
      tags: e.tags,
      status: 'confirmed',
    }).returning();

    // Add a registration for the client
    await db.insert(schema.registrations).values({
      eventId: event.id,
      clientId: clientUser.id,
      status: 'confirmed',
      confirmedAt: new Date(),
    }).onConflictDoNothing();

    console.log(`  Created event '${e.title}'`);
  }

  console.log('Full seed complete.');
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  SECURITY: Seed accounts use well-known passwords.          ║');
  console.log('║  Change all passwords immediately after first login.        ║');
  console.log('║  Do NOT run seed in production without resetting passwords. ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  await client.end();
}

// Run directly
const dbUrl = process.env.DATABASE_URL;
if (dbUrl) {
  seedFull(dbUrl).catch((err) => {
    console.error('Full seed failed:', err);
    process.exit(1);
  });
}
