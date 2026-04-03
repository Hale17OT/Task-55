import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import * as schema from '@studioops/db/schema';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

type AppDatabase = PostgresJsDatabase<typeof schema>;

declare module 'fastify' {
  interface FastifyInstance {
    db: AppDatabase;
    dbClient: ReturnType<typeof postgres>;
  }
}

interface DatabasePluginOptions {
  connectionString: string;
}

async function databasePlugin(fastify: FastifyInstance, opts: DatabasePluginOptions) {
  const client = postgres(opts.connectionString, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
  });

  const db = drizzle(client, { schema });

  // Verify connection
  try {
    await db.execute(sql`SELECT 1`);
    fastify.log.info('Database connection established');
  } catch (err) {
    fastify.log.fatal({ err }, 'Failed to connect to database');
    throw err;
  }

  fastify.decorate('db', db);
  fastify.decorate('dbClient', client);

  fastify.addHook('onClose', async () => {
    fastify.log.info('Closing database connection');
    await client.end();
  });
}

export default fp(databasePlugin, {
  name: 'database',
  fastify: '5.x',
});
