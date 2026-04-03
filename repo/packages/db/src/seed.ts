import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, and } from 'drizzle-orm';
import * as schema from './schema/index';

const PERMISSIONS_MANIFEST = [
  { resource: 'offering', action: 'create' },
  { resource: 'offering', action: 'read' },
  { resource: 'offering', action: 'update' },
  { resource: 'offering', action: 'delete' },
  { resource: 'portfolio', action: 'upload' },
  { resource: 'portfolio', action: 'read' },
  { resource: 'portfolio', action: 'update' },
  { resource: 'portfolio', action: 'delete' },
  { resource: 'event', action: 'create' },
  { resource: 'event', action: 'read' },
  { resource: 'event', action: 'update' },
  { resource: 'event', action: 'delete' },
  { resource: 'registration', action: 'create' },
  { resource: 'registration', action: 'read' },
  { resource: 'registration', action: 'update' },
  { resource: 'analytics', action: 'view' },
  { resource: 'analytics', action: 'export' },
  { resource: 'dedup', action: 'review' },
  { resource: 'dedup', action: 'merge' },
  { resource: 'data_quality', action: 'review' },
  { resource: 'data_quality', action: 'resolve' },
  { resource: 'user', action: 'read' },
  { resource: 'user', action: 'update' },
  { resource: 'admin', action: 'manage_roles' },
  { resource: 'admin', action: 'manage_rules' },
  { resource: 'admin', action: 'manage_config' },
  { resource: 'admin', action: 'manage_sessions' },
  { resource: 'audit', action: 'read' },
];

type RoleName = 'guest' | 'client' | 'merchant' | 'operations';

const ROLE_PERMISSIONS: Record<RoleName, string[]> = {
  guest: ['offering:read'],
  client: [
    'offering:read', 'portfolio:read', 'event:read',
    'registration:create', 'registration:read', 'user:read', 'user:update',
  ],
  merchant: [
    'offering:create', 'offering:read', 'offering:update', 'offering:delete',
    'portfolio:upload', 'portfolio:read', 'portfolio:update', 'portfolio:delete',
    'event:create', 'event:read', 'event:update', 'event:delete',
    'registration:create', 'registration:read', 'registration:update',
    'user:read', 'user:update',
  ],
  operations: [
    'offering:read', 'portfolio:read', 'event:read',
    'registration:read', 'registration:update',
    'analytics:view', 'analytics:export',
    'dedup:review', 'dedup:merge',
    'data_quality:review', 'data_quality:resolve',
    'audit:read', 'user:read',
  ],
};

export async function seed(connectionString: string) {
  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client, { schema });

  console.log('Seeding permissions...');

  // Upsert permissions
  for (const perm of PERMISSIONS_MANIFEST) {
    const existing = await db
      .select()
      .from(schema.permissions)
      .where(and(
        eq(schema.permissions.resource, perm.resource),
        eq(schema.permissions.action, perm.action),
      ))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(schema.permissions).values(perm);
    }
  }

  // Load all permissions for ID mapping
  const allPerms = await db.select().from(schema.permissions);
  const permMap = new Map(allPerms.map((p) => [`${p.resource}:${p.action}`, p.id]));

  // Upsert role_permissions
  for (const [role, permKeys] of Object.entries(ROLE_PERMISSIONS) as [RoleName, string[]][]) {
    for (const permKey of permKeys) {
      const permId = permMap.get(permKey);
      if (!permId) {
        console.warn(`Permission not found: ${permKey}`);
        continue;
      }

      const existing = await db
        .select()
        .from(schema.rolePermissions)
        .where(and(
          eq(schema.rolePermissions.role, role),
          eq(schema.rolePermissions.permissionId, permId),
        ))
        .limit(1);

      if (existing.length === 0) {
        await db.insert(schema.rolePermissions).values({ role, permissionId: permId });
      }
    }
  }

  // Seed default organization
  const existingOrg = await db
    .select()
    .from(schema.organizations)
    .where(eq(schema.organizations.slug, 'default-studio'))
    .limit(1);

  let orgId: string;
  if (existingOrg.length === 0) {
    const [org] = await db
      .insert(schema.organizations)
      .values({ name: 'Default Studio', slug: 'default-studio' })
      .returning();
    orgId = org.id;
    console.log('Created default organization:', orgId);
  } else {
    orgId = existingOrg[0].id;
    console.log('Default organization exists:', orgId);
  }

  // Seed default quota/rate-limit rules
  const defaultRules = [
    { ruleKey: 'daily_upload_limit', config: { limit: 20, window: 'day' } },
    { ruleKey: 'hourly_portfolio_edit_limit', config: { limit: 10, window: 'hour' } },
    { ruleKey: 'export_cooldown', config: { limit: 100, window: 'day', cooldownSeconds: 60 } },
  ];

  for (const rule of defaultRules) {
    const existing = await db
      .select()
      .from(schema.rules)
      .where(and(
        eq(schema.rules.ruleKey, rule.ruleKey),
        eq(schema.rules.status, 'active'),
      ))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(schema.rules).values({
        ruleKey: rule.ruleKey,
        version: 1,
        config: rule.config,
        effectiveFrom: new Date(),
        canaryPercent: 100,
        status: 'active',
      });
      console.log(`  Created rule '${rule.ruleKey}'`);
    }
  }

  console.log('Seed complete.');
  await client.end();
  return { orgId };
}

// Only auto-run when called directly as main module
const isMainModule = process.argv[1]?.includes('seed.ts') && !process.argv[1]?.includes('seed-full');
if (isMainModule) {
  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl) {
    seed(dbUrl).catch((err) => {
      console.error('Seed failed:', err);
      process.exit(1);
    });
  }
}
