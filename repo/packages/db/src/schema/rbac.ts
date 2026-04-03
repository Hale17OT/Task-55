import { pgTable, uuid, varchar, uniqueIndex } from 'drizzle-orm/pg-core';
import { roleEnum } from './enums';

export const permissions = pgTable('permissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  resource: varchar('resource', { length: 100 }).notNull(),
  action: varchar('action', { length: 100 }).notNull(),
}, (table) => [
  uniqueIndex('permissions_resource_action_idx').on(table.resource, table.action),
]);

export const rolePermissions = pgTable('role_permissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  role: roleEnum('role').notNull(),
  permissionId: uuid('permission_id').notNull().references(() => permissions.id),
}, (table) => [
  uniqueIndex('role_permissions_role_permission_idx').on(table.role, table.permissionId),
]);
