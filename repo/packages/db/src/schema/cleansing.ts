import { pgTable, uuid, varchar, text, jsonb, numeric, timestamp } from 'drizzle-orm/pg-core';
import { dupStatusEnum } from './enums';
import { users } from './auth';

export const duplicateCandidates = pgTable('duplicate_candidates', {
  id: uuid('id').primaryKey().defaultRandom(),
  recordType: varchar('record_type', { length: 50 }).notNull(), // 'offering' | 'portfolio_item'
  recordAId: uuid('record_a_id').notNull(),
  recordBId: uuid('record_b_id').notNull(),
  similarityScore: numeric('similarity_score', { precision: 5, scale: 4 }).notNull(),
  featureScores: jsonb('feature_scores').notNull(), // { title, price, duration, tags }
  status: dupStatusEnum('status').notNull().default('pending'),
  reviewedBy: uuid('reviewed_by').references(() => users.id),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const mergeHistory = pgTable('merge_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  duplicateCandidateId: uuid('duplicate_candidate_id').references(() => duplicateCandidates.id),
  survivingId: uuid('surviving_id').notNull(),
  mergedId: uuid('merged_id').notNull(),
  provenance: jsonb('provenance').notNull(), // { original_creators, merge_chain }
  performedBy: uuid('performed_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const dataQualityFlags = pgTable('data_quality_flags', {
  id: uuid('id').primaryKey().defaultRandom(),
  recordType: varchar('record_type', { length: 50 }).notNull(),
  recordId: uuid('record_id').notNull(),
  field: varchar('field', { length: 100 }).notNull(),
  issue: varchar('issue', { length: 50 }).notNull(), // 'MISSING', 'OUTLIER', 'UNKNOWN_CURRENCY'
  detail: jsonb('detail'),
  status: varchar('status', { length: 20 }).notNull().default('open'), // 'open' | 'resolved'
  resolvedBy: uuid('resolved_by').references(() => users.id),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
