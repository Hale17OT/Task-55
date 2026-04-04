FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
COPY tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY apps/api/package.json apps/api/

RUN npm install --workspaces --include-workspace-root

COPY packages/shared/ packages/shared/
COPY packages/db/ packages/db/
COPY apps/api/ apps/api/

# Build workspace packages so dist/ directories exist for module resolution
RUN npm run build --workspace=packages/shared --workspace=packages/db --workspace=apps/api --if-present

# --- Production stage (using tsx for module resolution) ---
FROM node:22-alpine

RUN apk add --no-cache postgresql-client ffmpeg
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Copy full workspace (tsx needs source files)
COPY --from=builder /app/ /app/

COPY apps/api/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

RUN mkdir -p /data/media && chown -R appuser:appgroup /data/media

USER appuser
EXPOSE 3000
CMD ["/docker-entrypoint.sh"]
