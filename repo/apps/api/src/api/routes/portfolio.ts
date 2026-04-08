import { FastifyInstance } from 'fastify';
import { join } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { MEDIA, QUOTAS } from '@studioops/shared';
import { validateFile } from '../../core/domain/media-validation';
import { DrizzlePortfolioRepository } from '../../infrastructure/persistence/portfolio-repository';
import { DrizzleCleansingRepository } from '../../infrastructure/persistence/cleansing-repository';
import { processImage } from '../../infrastructure/media/image-processor';
import { processVideo } from '../../infrastructure/media/video-processor';
import { normalizeDuration, pixelsToInches, normalizeCurrency, detectOutlier } from '../../core/domain/normalizers';

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB

export default async function portfolioRoutes(fastify: FastifyInstance) {
  const portfolioRepo = new DrizzlePortfolioRepository(fastify.db);
  const cleansingRepo = new DrizzleCleansingRepository(fastify.db);
  const storageRoot = fastify.appConfig?.STORAGE_ROOT || process.env.STORAGE_ROOT || './data/media';

  // POST /portfolio/upload (with rules-engine quota enforcement)
  fastify.post('/upload', {
    preHandler: [fastify.authenticate, fastify.authorize('portfolio', 'upload'), fastify.enforceQuota('daily_upload_limit')],
  }, async (request, reply) => {
    const data = await request.file();
    if (!data) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', message: 'No file uploaded' });
    }

    const mimeType = data.mimetype;
    const fileBuffer = await data.toBuffer();
    const fileSizeBytes = fileBuffer.length;

    // Validate file
    const validation = validateFile(mimeType, fileSizeBytes, MAX_FILE_SIZE);
    if (!validation.valid) {
      return reply.status(422).send({
        error: validation.errorCode,
        message: validation.error,
      });
    }

    // Quota is enforced by rules-engine preHandler (daily_upload_limit rule)

    // Get org from authContext; for admin (orgScope is undefined), look up org membership directly
    let orgId = request.authContext?.orgScope?.[0];
    if (!orgId && request.user.role === 'administrator') {
      const { DrizzlePermissionRepository } = await import('../../infrastructure/persistence/permission-repository');
      const permRepo = new DrizzlePermissionRepository(fastify.db);
      const adminOrgs = await permRepo.getOrgIdsForUser(request.user.sub);
      orgId = adminOrgs[0];
    }
    if (!orgId) {
      return reply.status(403).send({ error: 'FORBIDDEN', message: 'No organization assigned' });
    }

    // Write original file to disk
    const fileId = randomUUID();
    const ext = mimeType.split('/')[1] === 'quicktime' ? 'mov' : mimeType.split('/')[1];
    const relativePath = join(orgId, 'originals', `${fileId}.${ext}`);
    const absolutePath = join(storageRoot, relativePath);

    await mkdir(join(storageRoot, orgId, 'originals'), { recursive: true });
    await writeFile(absolutePath, fileBuffer);

    // Parse title from fields or filename
    const fields = data.fields as any;
    const title = fields?.title?.value || data.filename || 'Untitled';
    const description = fields?.description?.value || null;
    const categoryId = fields?.categoryId?.value || null;

    // Create DB record with status=pending
    const item = await portfolioRepo.createItem({
      merchantId: request.user.sub,
      originalOrgId: orgId,
      categoryId,
      title,
      description,
      mediaType: validation.mediaType!,
      originalPath: relativePath,
      mimeType,
      fileSizeBytes,
    });

    // Async processing (fire-and-forget for photos, synchronous for now)
    if (validation.mediaType === 'photo') {
      // Process image in background
      const outputDir = join(storageRoot, orgId);
      processImage(absolutePath, outputDir, fileId)
        .then(async (result) => {
          await portfolioRepo.updateProcessingResult(item.id, {
            status: 'ready',
            processedPath: join(orgId, 'processed', `${fileId}.jpg`),
            previewPath: join(orgId, 'previews', `${fileId}.jpg`),
            width: result.width,
            height: result.height,
            widthInches: pixelsToInches(result.width).toFixed(2),
            heightInches: pixelsToInches(result.height).toFixed(2),
          });
        })
        .catch(async (err) => {
          request.log.error({ err, itemId: item.id }, 'Media processing failed');
          await portfolioRepo.updateProcessingResult(item.id, {
            status: 'failed',
            errorDetail: (err as Error).message,
          });
        });
    } else if (validation.mediaType === 'video') {
      // Process video: transcode to 1080p H.264, extract poster frame
      const outputDir = join(storageRoot, orgId);
      processVideo(absolutePath, outputDir, fileId)
        .then(async (result) => {
          await portfolioRepo.updateProcessingResult(item.id, {
            status: 'ready',
            processedPath: join(orgId, 'processed', `${fileId}.mp4`),
            previewPath: join(orgId, 'previews', `${fileId}.jpg`),
            width: result.width,
            height: result.height,
            durationSeconds: result.durationSeconds,
          });
        })
        .catch(async (err) => {
          request.log.error({ err, itemId: item.id }, 'Video processing failed');
          await portfolioRepo.updateProcessingResult(item.id, {
            status: 'failed',
            errorDetail: (err as Error).message,
          });
        });
    }

    request.auditContext = { resourceType: 'portfolio', resourceId: item.id, action: 'portfolio.upload', afterState: item };
    await request.writeAudit();

    // Auto-cleansing on upload metadata (fire-and-forget)
    (async () => {
      try {
        // Normalize dimensions: convert file pixel dimensions to inches at 300 DPI and persist
        const widthInches = item.width ? pixelsToInches(item.width) : null;
        const heightInches = item.height ? pixelsToInches(item.height) : null;

        if (widthInches !== null || heightInches !== null) {
          await portfolioRepo.updateProcessingResult(item.id, {
            status: item.status || 'pending',
            widthInches: widthInches !== null ? widthInches.toFixed(2) : undefined,
            heightInches: heightInches !== null ? heightInches.toFixed(2) : undefined,
          });
        }

        // Flag missing metadata
        if (!item.title || item.title.trim().length === 0) {
          await cleansingRepo.createFlag({ recordType: 'portfolio_item', recordId: item.id, field: 'title', issue: 'MISSING' });
        }

        // Flag if file size is suspiciously large (> 200MB for photos)
        if (item.mediaType === 'photo' && item.fileSizeBytes > 200 * 1024 * 1024) {
          await cleansingRepo.createFlag({ recordType: 'portfolio_item', recordId: item.id, field: 'fileSize', issue: 'OUTLIER', detail: { bytes: item.fileSizeBytes } });
        }

        // Flag if normalized dimensions are unusually small (< 2 inches on any side for photos)
        if (item.mediaType === 'photo' && widthInches !== null && heightInches !== null) {
          if (widthInches < 2 || heightInches < 2) {
            await cleansingRepo.createFlag({
              recordType: 'portfolio_item', recordId: item.id, field: 'dimensions', issue: 'OUTLIER',
              detail: { widthInches: widthInches.toFixed(2), heightInches: heightInches.toFixed(2), note: 'Dimensions below 2 inches at 300 DPI' },
            });
          }
        }

        // Dedup: check for near-identical portfolio items in same org by title
        const existingItems = await portfolioRepo.listItems({ orgScope: [orgId], page: 1, limit: 100 });
        for (const existing of existingItems.data) {
          if (existing.id === item.id) continue;
          // Simple title similarity check
          const titleA = item.title.toLowerCase().trim();
          const titleB = existing.title.toLowerCase().trim();
          if (titleA === titleB && item.mimeType === existing.mimeType) {
            await cleansingRepo.createCandidate({
              recordType: 'portfolio_item', recordAId: item.id, recordBId: existing.id,
              similarityScore: 0.95, featureScores: { title: 1.0, mimeType: 1.0 },
            });
          }
        }
      } catch (err) {
        fastify.log.error({ err, itemId: item.id }, 'Portfolio auto-cleansing failed');
      }
    })();

    return reply.status(202).send({ id: item.id, status: 'pending', title: item.title, createdAt: item.createdAt });
  });

  // GET /portfolio
  fastify.get('/', {
    preHandler: [fastify.authenticate, fastify.authorize('portfolio', 'read')],
  }, async (request, reply) => {
    const query = request.query as { page?: string; limit?: string; categoryId?: string; status?: string };
    const page = Math.max(1, parseInt(query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || '20', 10)));

    const isMerchant = request.user.role === 'merchant';
    const result = await portfolioRepo.listItems({
      merchantId: isMerchant ? request.user.sub : undefined,
      orgScope: request.authContext?.orgScope,
      categoryId: query.categoryId,
      status: query.status,
      page,
      limit,
    });

    return reply.status(200).send({
      data: result.data,
      meta: { page, limit, total: result.total, totalPages: Math.ceil(result.total / limit) },
    });
  });

  // GET /portfolio/:id (with org-scope/ownership enforcement)
  fastify.get('/:id', {
    preHandler: [fastify.authenticate, fastify.authorize('portfolio', 'read')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const item = await portfolioRepo.findById(id);
    if (!item) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Portfolio item not found' });

    // Object-level auth: enforce per-role access
    if (request.user.role === 'administrator') {
      // Admin sees all — no restriction
    } else if (request.user.role === 'merchant') {
      // Merchant sees only own items
      if (item.merchantId !== request.user.sub) {
        return reply.status(404).send({ error: 'NOT_FOUND', message: 'Portfolio item not found' });
      }
    } else {
      // Operations, Client, Guest: must have item's org in scope
      const orgScope = request.authContext?.orgScope ?? [];
      if (!orgScope.includes(item.originalOrgId)) {
        return reply.status(404).send({ error: 'NOT_FOUND', message: 'Portfolio item not found' });
      }
    }

    const tags = await portfolioRepo.getItemTags(id);
    return reply.status(200).send({ ...item, tags });
  });

  // DELETE /portfolio/:id
  fastify.delete('/:id', {
    preHandler: [fastify.authenticate, fastify.authorize('portfolio', 'delete')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const item = await portfolioRepo.findById(id);
    if (!item) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Portfolio item not found' });

    if (request.user.role === 'merchant' && item.merchantId !== request.user.sub) {
      return reply.status(403).send({ error: 'FORBIDDEN', message: 'You do not own this resource' });
    }
    if (request.user.role === 'operations') {
      const orgScope = request.authContext?.orgScope ?? [];
      if (!orgScope.includes(item.originalOrgId)) {
        return reply.status(404).send({ error: 'NOT_FOUND', message: 'Portfolio item not found' });
      }
    }

    await portfolioRepo.softDelete(id);
    request.auditContext = { resourceType: 'portfolio', resourceId: id, beforeState: item };
    await request.writeAudit();
    return reply.status(204).send();
  });

  // PATCH /portfolio/:id/tags
  fastify.patch('/:id/tags', {
    preHandler: [fastify.authenticate, fastify.authorize('portfolio', 'update'), fastify.enforceQuota('hourly_portfolio_edit_limit')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { tagNames } = request.body as { tagNames?: string[] };

    if (!tagNames || !Array.isArray(tagNames)) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', message: 'tagNames array is required' });
    }

    const item = await portfolioRepo.findById(id);
    if (!item) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Portfolio item not found' });

    if (request.user.role === 'merchant' && item.merchantId !== request.user.sub) {
      return reply.status(403).send({ error: 'FORBIDDEN', message: 'You do not own this resource' });
    }
    if (request.user.role === 'operations') {
      const orgScope = request.authContext?.orgScope ?? [];
      if (!orgScope.includes(item.originalOrgId)) {
        return reply.status(404).send({ error: 'NOT_FOUND', message: 'Portfolio item not found' });
      }
    }

    const tagRecords = await Promise.all(tagNames.map((name) => portfolioRepo.getOrCreateTag(name)));
    await portfolioRepo.setItemTags(id, tagRecords.map((t) => t.id));

    const tags = await portfolioRepo.getItemTags(id);
    request.auditContext = { resourceType: 'portfolio', resourceId: id, action: 'portfolio.edit' };
    await request.writeAudit();
    return reply.status(200).send({ ...item, tags });
  });

  // GET /portfolio/tags (scoped to requester's org/ownership context)
  fastify.get('/tags', {
    preHandler: [fastify.authenticate, fastify.authorize('portfolio', 'read')],
  }, async (request, reply) => {
    const { search } = request.query as { search?: string };
    const isMerchant = request.user.role === 'merchant';
    const tags = await portfolioRepo.listTags({
      search,
      merchantId: isMerchant ? request.user.sub : undefined,
      orgScope: request.authContext?.orgScope,
    });
    return reply.status(200).send({ data: tags });
  });

  // GET /portfolio/categories
  fastify.get('/categories', {
    preHandler: [fastify.authenticate, fastify.authorize('portfolio', 'read')],
  }, async (request, reply) => {
    const categories = await portfolioRepo.listCategories(request.user.sub);
    return reply.status(200).send({ data: categories });
  });

  // POST /portfolio/categories
  fastify.post('/categories', {
    preHandler: [fastify.authenticate, fastify.authorize('portfolio', 'update'), fastify.enforceQuota('hourly_portfolio_edit_limit')],
  }, async (request, reply) => {
    const { name, sortOrder } = request.body as { name: string; sortOrder?: number };
    if (!name || name.trim().length === 0) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', message: 'Category name is required' });
    }

    const category = await portfolioRepo.createCategory(request.user.sub, name.trim(), sortOrder ?? 0);
    request.auditContext = { resourceType: 'portfolio_category', resourceId: category.id, afterState: category };
    await request.writeAudit();
    return reply.status(201).send(category);
  });

  // PUT /portfolio/categories/:categoryId
  fastify.put('/categories/:categoryId', {
    preHandler: [fastify.authenticate, fastify.authorize('portfolio', 'update'), fastify.enforceQuota('hourly_portfolio_edit_limit')],
  }, async (request, reply) => {
    const { categoryId } = request.params as { categoryId: string };
    const { name, sortOrder } = request.body as { name?: string; sortOrder?: number };

    const updated = await portfolioRepo.updateCategory(categoryId, request.user.sub, { name, sortOrder });
    if (!updated) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Category not found' });
    request.auditContext = { resourceType: 'portfolio_category', resourceId: categoryId, action: 'category.update', afterState: updated };
    await request.writeAudit();
    return reply.status(200).send(updated);
  });

  // DELETE /portfolio/categories/:categoryId
  fastify.delete('/categories/:categoryId', {
    preHandler: [fastify.authenticate, fastify.authorize('portfolio', 'delete'), fastify.enforceQuota('hourly_portfolio_edit_limit')],
  }, async (request, reply) => {
    const { categoryId } = request.params as { categoryId: string };
    await portfolioRepo.deleteCategory(categoryId, request.user.sub);
    request.auditContext = { resourceType: 'portfolio_category', resourceId: categoryId, action: 'category.delete' };
    await request.writeAudit();
    return reply.status(204).send();
  });

  // PATCH /portfolio/:id/category
  fastify.patch('/:id/category', {
    preHandler: [fastify.authenticate, fastify.authorize('portfolio', 'update'), fastify.enforceQuota('hourly_portfolio_edit_limit')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { categoryId } = request.body as { categoryId: string | null };

    const item = await portfolioRepo.findById(id);
    if (!item) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Portfolio item not found' });
    if (request.user.role === 'merchant' && item.merchantId !== request.user.sub) {
      return reply.status(403).send({ error: 'FORBIDDEN', message: 'You do not own this resource' });
    }
    if (request.user.role === 'operations') {
      const orgScope = request.authContext?.orgScope ?? [];
      if (!orgScope.includes(item.originalOrgId)) {
        return reply.status(404).send({ error: 'NOT_FOUND', message: 'Portfolio item not found' });
      }
    }

    // Validate category belongs to the same merchant (if categoryId is provided)
    if (categoryId) {
      const categories = await portfolioRepo.listCategories(request.user.sub);
      const ownsCat = categories.some((c: any) => c.id === categoryId);
      if (!ownsCat && request.user.role !== 'administrator') {
        return reply.status(403).send({ error: 'FORBIDDEN', message: 'Category does not belong to you' });
      }
    }

    await portfolioRepo.updateItemCategory(id, categoryId);
    request.auditContext = { resourceType: 'portfolio', resourceId: id, action: 'portfolio.edit' };
    await request.writeAudit();
    return reply.status(200).send({ id, categoryId });
  });
}
