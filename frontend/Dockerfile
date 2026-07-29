# ReBit Frontend — Next.js (three-stage build)
# ============================================================
# Stage 1: Dependencies  — install npm packages
# Stage 2: Builder       — generate Prisma client & build
# Stage 3: Runner        — minimal production image
# ============================================================

ARG NODE_VERSION=20-alpine

# ── Stage 1: Dependencies ───────────────────────────────────────────────
FROM node:${NODE_VERSION} AS deps

RUN apk add --no-cache libc6-compat

WORKDIR /app

COPY package.json package-lock.json* ./

RUN npm ci && npm cache clean --force


# ── Stage 2: Builder ────────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS builder

WORKDIR /app

# Copy pre-installed node_modules from deps stage (avoids re-installing)
COPY --from=deps /app/node_modules ./node_modules

# Copy the rest of the application source code
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build the Next.js app (output: 'standalone' in next.config.ts produces
# .next/standalone/ with all dependencies bundled)
RUN npm run build && \
    ls -la /app/.next/standalone/server.js > /dev/null 2>&1 || \
    (echo "FATAL: .next/standalone/ was not produced by the build!" && exit 1)


# ── Stage 3: Runner ─────────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Install runtime tools
RUN apk add --no-cache openssl bash wget

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy public assets (served directly, not part of standalone)
COPY --from=builder /app/public ./public

# Copy standalone output — use explicit destination path to avoid
# BuildKit checksum issues with large context transfers
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone /app/.next/standalone

# Copy static assets (hashed chunks, CSS, etc.) that the standalone
# server expects at ./.next/static — but inside standalone, Next.js
# looks for them at ./next/static relative to the server.js entry
COPY --from=builder --chown=nextjs:nodejs /app/.next/static /app/.next/standalone/.next/static

# Prisma runtime — copy the generated client into standalone's node_modules
# so server.js can find @prisma/client at runtime
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma /app/.next/standalone/node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma /app/.next/standalone/node_modules/@prisma

# Full node_modules from builder. Next.js 16 standalone output only
# includes production deps, but prisma is a devDependency that we
# need at runtime for `migrate deploy`.
COPY --from=builder /app/node_modules /app/.next/standalone/node_modules

# Prisma schema + migrations (needed for prisma migrate deploy at runtime)
# Stored at lib/prisma/ relative to the app root (see current project layout)
COPY --from=builder --chown=nextjs:nodejs /app/lib/prisma/schema.prisma /app/.next/standalone/lib/prisma/schema.prisma
COPY --from=builder --chown=nextjs:nodejs /app/lib/prisma/migrations /app/.next/standalone/lib/prisma/migrations

# Copy the entrypoint script
COPY docker-entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh && \
    chown nextjs:nodejs /app/entrypoint.sh

# Create data directories for Sia key storage and uploads
RUN mkdir -p /tmp/sia /tmp/rebit/uploads && \
    chown -R nextjs:nodejs /tmp/sia /tmp/rebit/uploads

# Ensure /app is owned by nextjs
RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

ENTRYPOINT ["/app/entrypoint.sh"]