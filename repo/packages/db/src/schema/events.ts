import { pgTable, uuid, varchar, text, integer, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { eventStatusEnum, registrationStatusEnum } from './enums';
import { users } from './auth';
import { organizations } from './organizations';
import { offerings } from './offerings';

export const events = pgTable('events', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  merchantId: uuid('merchant_id').notNull().references(() => users.id),
  offeringId: uuid('offering_id').references(() => offerings.id),
  title: varchar('title', { length: 200 }).notNull(),
  description: text('description'),
  eventType: varchar('event_type', { length: 100 }).notNull(),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
  durationMinutes: integer('duration_minutes').notNull(),
  status: eventStatusEnum('status').notNull().default('scheduled'),
  channel: varchar('channel', { length: 100 }).notNull().default('website'),
  tags: text('tags').array().notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const registrations = pgTable('registrations', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventId: uuid('event_id').notNull().references(() => events.id),
  clientId: uuid('client_id').notNull().references(() => users.id),
  status: registrationStatusEnum('status').notNull().default('registered'),
  registeredAt: timestamp('registered_at', { withTimezone: true }).notNull().defaultNow(),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  arrivedAt: timestamp('arrived_at', { withTimezone: true }),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  cancelReason: text('cancel_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('registrations_event_client_idx').on(table.eventId, table.clientId),
]);
