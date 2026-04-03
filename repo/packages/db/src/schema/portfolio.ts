import { pgTable, uuid, varchar, text, integer, numeric, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { mediaTypeEnum, processingStatusEnum } from './enums';
import { users } from './auth';

export const portfolioCategories = pgTable('portfolio_categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  merchantId: uuid('merchant_id').notNull().references(() => users.id),
  name: varchar('name', { length: 100 }).notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const portfolioItems = pgTable('portfolio_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  merchantId: uuid('merchant_id').notNull().references(() => users.id),
  originalOrgId: uuid('original_org_id').notNull(),
  categoryId: uuid('category_id').references(() => portfolioCategories.id),
  title: varchar('title', { length: 200 }).notNull(),
  description: text('description'),
  mediaType: mediaTypeEnum('media_type').notNull(),
  status: processingStatusEnum('status').notNull().default('pending'),
  originalPath: varchar('original_path', { length: 500 }).notNull(),
  processedPath: varchar('processed_path', { length: 500 }),
  previewPath: varchar('preview_path', { length: 500 }),
  mimeType: varchar('mime_type', { length: 100 }).notNull(),
  fileSizeBytes: integer('file_size_bytes').notNull(),
  width: integer('width'),
  height: integer('height'),
  widthInches: numeric('width_inches', { precision: 8, scale: 2 }),
  heightInches: numeric('height_inches', { precision: 8, scale: 2 }),
  durationSeconds: integer('duration_seconds'),
  errorDetail: text('error_detail'),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const portfolioTags = pgTable('portfolio_tags', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 50 }).notNull().unique(),
});

export const portfolioItemTags = pgTable('portfolio_item_tags', {
  itemId: uuid('item_id').notNull().references(() => portfolioItems.id),
  tagId: uuid('tag_id').notNull().references(() => portfolioTags.id),
}, (table) => [
  uniqueIndex('portfolio_item_tags_idx').on(table.itemId, table.tagId),
]);
