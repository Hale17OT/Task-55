import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import sensible from '@fastify/sensible';
import multipart from '@fastify/multipart';
import databasePlugin from './infrastructure/plugins/database';
import errorHandlerPlugin from './infrastructure/plugins/error-handler';
import authPlugin from './infrastructure/plugins/auth';
import rbacPlugin from './infrastructure/plugins/rbac';
import rateLimitPlugin from './infrastructure/plugins/rate-limit';
import auditLogPlugin from './infrastructure/plugins/audit-log';
import rulesEnginePlugin from './infrastructure/plugins/rules-engine';
import auditRetentionPlugin from './infrastructure/plugins/audit-retention';
import healthRoutes from './api/routes/health';
import authRoutes from './api/routes/auth';
import offeringRoutes from './api/routes/offerings';
import eventRoutes from './api/routes/events';
import portfolioRoutes from './api/routes/portfolio';
import dedupRoutes from './api/routes/dedup';
import analyticsRoutes from './api/routes/analytics';
import adminRoutes from './api/routes/admin';
import importRoutes from './api/routes/import';
import mediaRoutes from './api/routes/media';
import type { AppConfig } from './infrastructure/config';

declare module 'fastify' {
  interface FastifyInstance {
    appConfig: AppConfig;
  }
}

export interface BuildAppOptions {
  config: AppConfig;
}

export async function buildApp(opts: BuildAppOptions): Promise<FastifyInstance> {
  const { config } = opts;

  const fastify = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      redact: {
        paths: [
          'req.headers.authorization',
          'req.body.password',
          'req.body.currentPassword',
          'req.body.newPassword',
          'req.body.refreshToken',
        ],
        censor: '[REDACTED]',
      },
      ...(config.NODE_ENV === 'development' ? { transport: { target: 'pino-pretty' } } : {}),
    },
  });

  // Make validated config available to all plugins and routes
  fastify.decorate('appConfig', config);

  // --- Core plugins ---
  await fastify.register(sensible);
  await fastify.register(errorHandlerPlugin);
  await fastify.register(cors, {
    origin: config.CORS_ORIGIN,
    credentials: true,
  });
  await fastify.register(helmet, {
    contentSecurityPolicy: false,
  });
  await fastify.register(multipart, {
    limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
  });

  // --- Database ---
  await fastify.register(databasePlugin, {
    connectionString: config.DATABASE_URL,
  });

  // --- Auth & RBAC ---
  await fastify.register(authPlugin, {
    jwtSecret: config.JWT_SECRET,
  });
  await fastify.register(rbacPlugin);
  await fastify.register(rateLimitPlugin);
  await fastify.register(auditLogPlugin);
  await fastify.register(rulesEnginePlugin);
  await fastify.register(auditRetentionPlugin);

  // --- Routes ---
  await fastify.register(healthRoutes, { prefix: '/api/v1' });
  await fastify.register(authRoutes, { prefix: '/api/v1/auth' });
  await fastify.register(offeringRoutes, { prefix: '/api/v1/offerings' });
  await fastify.register(eventRoutes, { prefix: '/api/v1/events' });
  await fastify.register(portfolioRoutes, { prefix: '/api/v1/portfolio' });
  await fastify.register(dedupRoutes, { prefix: '/api/v1/dedup' });
  await fastify.register(analyticsRoutes, { prefix: '/api/v1/analytics' });
  await fastify.register(adminRoutes, { prefix: '/api/v1/admin' });
  await fastify.register(importRoutes, { prefix: '/api/v1/import' });
  await fastify.register(mediaRoutes, { prefix: '/api/v1/media' });

  return fastify;
}
