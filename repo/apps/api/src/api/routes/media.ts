import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { join, resolve, normalize } from 'node:path';
import { createReadStream, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { eq, or } from 'drizzle-orm';
import { portfolioItems } from '@studioops/db/schema';

const MIME_MAP: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.tiff': 'image/tiff',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
};

export default async function mediaRoutes(fastify: FastifyInstance) {
  const storageRoot = resolve(process.env.STORAGE_ROOT || './data/media');

  // GET /media/* — serve processed/preview media files with ownership/org authorization
  fastify.get('/*', {
    preHandler: [fastify.authenticate, fastify.authorize('portfolio', 'read')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as { '*': string };
    const relativePath = normalize(params['*']);

    // Prevent directory traversal
    if (relativePath.includes('..') || relativePath.startsWith('/')) {
      return reply.status(400).send({ error: 'BAD_REQUEST', message: 'Invalid path' });
    }

    // Only serve from processed/ and previews/ subdirectories
    const pathParts = relativePath.split('/');
    if (pathParts.length < 3 || !['processed', 'previews'].includes(pathParts[1])) {
      return reply.status(403).send({ error: 'FORBIDDEN', message: 'Access to this path is not allowed' });
    }

    // Look up the portfolio item that owns this media path
    const [item] = await fastify.db
      .select({
        id: portfolioItems.id,
        merchantId: portfolioItems.merchantId,
        originalOrgId: portfolioItems.originalOrgId,
      })
      .from(portfolioItems)
      .where(or(
        eq(portfolioItems.processedPath, relativePath),
        eq(portfolioItems.previewPath, relativePath),
      ))
      .limit(1);

    if (!item) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Media file not found' });
    }

    // Enforce same authorization as GET /portfolio/:id
    if (request.user.role === 'administrator') {
      // Admin sees all
    } else if (request.user.role === 'merchant') {
      if (item.merchantId !== request.user.sub) {
        return reply.status(404).send({ error: 'NOT_FOUND', message: 'Media file not found' });
      }
    } else {
      const orgScope = request.authContext?.orgScope ?? [];
      if (!orgScope.includes(item.originalOrgId)) {
        return reply.status(404).send({ error: 'NOT_FOUND', message: 'Media file not found' });
      }
    }

    const absolutePath = join(storageRoot, relativePath);

    // Ensure resolved path is still within storage root
    if (!absolutePath.startsWith(storageRoot)) {
      return reply.status(403).send({ error: 'FORBIDDEN', message: 'Access denied' });
    }

    if (!existsSync(absolutePath)) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Media file not found' });
    }

    const fileStat = await stat(absolutePath);
    const ext = '.' + relativePath.split('.').pop()?.toLowerCase();
    const contentType = MIME_MAP[ext] || 'application/octet-stream';

    reply
      .header('Content-Type', contentType)
      .header('Content-Length', fileStat.size)
      .header('Cache-Control', 'private, max-age=3600');

    return reply.send(createReadStream(absolutePath));
  });
}
