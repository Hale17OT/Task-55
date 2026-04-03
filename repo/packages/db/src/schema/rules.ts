import { pgTable, uuid, varchar, integer, jsonb, timestamp, boolean, numeric, uniqueIndex } from 'drizzle-orm/pg-core';
import { ruleStatusEnum } from './enums';
import { users } from './auth';

export const rules = pgTable('rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  ruleKey: varchar('rule_key', { length: 100 }).notNull(),
  version: integer('version').notNull().default(1),
  config: jsonb('config').notNull(), // { limit, window, cooldownSeconds }
  effectiveFrom: timestamp('effective_from', { withTimezone: true }).notNull(),
  effectiveTo: timestamp('effective_to', { withTimezone: true }),
  canaryPercent: integer('canary_percent').notNull().default(100),
  status: ruleStatusEnum('status').notNull().default('active'),
  createdBy: uuid('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('rules_key_version_idx').on(table.ruleKey, table.version),
]);

export const userViolations = pgTable('user_violations', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  ruleKey: varchar('rule_key', { length: 100 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const ruleWhitelist = pgTable('rule_whitelist', {
  id: uuid('id').primaryKey().defaultRandom(),
  ruleKey: varchar('rule_key', { length: 100 }).notNull(),
  userId: uuid('user_id').notNull().references(() => users.id),
  grantedBy: uuid('granted_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('rule_whitelist_key_user_idx').on(table.ruleKey, table.userId),
]);
