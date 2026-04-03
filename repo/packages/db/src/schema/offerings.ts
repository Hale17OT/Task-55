import { pgTable, uuid, varchar, text, integer, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { offeringStatusEnum, visibilityEnum } from './enums';
import { users } from './auth';
import { organizations } from './organizations';

export const offerings = pgTable('offerings', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  merchantId: uuid('merchant_id').notNull().references(() => users.id),
  title: varchar('title', { length: 200 }).notNull(),
  description: text('description'),
  basePriceCents: integer('base_price_cents').notNull(),
  durationMinutes: integer('duration_minutes').notNull(),
  tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
  status: offeringStatusEnum('status').notNull().default('draft'),
  visibility: visibilityEnum('visibility').notNull().default('public'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const offeringAddons = pgTable('offering_addons', {
  id: uuid('id').primaryKey().defaultRandom(),
  offeringId: uuid('offering_id').notNull().references(() => offerings.id),
  name: varchar('name', { length: 100 }).notNull(),
  priceCents: integer('price_cents').notNull(),
  unitDescription: varchar('unit_description', { length: 50 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('offering_addons_offering_name_idx').on(table.offeringId, table.name),
]);

export const offeringAccess = pgTable('offering_access', {
  id: uuid('id').primaryKey().defaultRandom(),
  offeringId: uuid('offering_id').notNull().references(() => offerings.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  grantedBy: uuid('granted_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('offering_access_offering_user_idx').on(table.offeringId, table.userId),
]);
