# ReBit Frontend — Next.js
# Multi-stage build for production (standalone output)

# ── Builder ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies (needed for Prisma and native modules)
RUN apk add --no-cache python3 make g++

# Copy dependency manifests first for layer caching
COPY package.json package-lock.json ./
RUN npm ci && npm cache clean --force

# Copy the rest of the application
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build the Next.js app (output: 'standalone' in next.config.ts produces
# .next/standalone/ with all dependencies bundled)
RUN npm run build

# ── Runner ───────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy public assets (served directly, not part of standalone)
COPY --from=builder /app/public ./public

# Copy the standalone build output — this includes the server, all JS
# bundles, and a minimal node_modules with only production deps.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./

# Copy static assets (hashed chunks, CSS, etc.) that the standalone
# server expects at ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy Prisma runtime dependencies:
#   @prisma/*       — client, engines, adapter-pg, etc. (~166 MB)
#   .prisma/client/ — generated client code (~9 MB)
#   prisma/build/   — CLI binary for `migrate deploy` (~40 MB)
#   schema.prisma   — schema file for migrations
#   migrations/     — migration SQL files
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/prisma/build ./node_modules/prisma/build
COPY --from=builder /app/lib/prisma/schema.prisma ./lib/prisma/schema.prisma
COPY --from=builder /app/lib/prisma/migrations ./lib/prisma/migrations

# Copy the entrypoint script that runs migrations before starting the server
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh && \
    chown nextjs:nodejs /docker-entrypoint.sh

# Create data directories for Sia key storage and uploads
RUN mkdir -p /tmp/sia /tmp/rebit/uploads && \
    chown -R nextjs:nodejs /tmp/sia /tmp/rebit/uploads

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

ENTRYPOINT ["/docker-entrypoint.sh"]