#!/bin/sh
set -e

# ── Prisma Migrations ──────────────────────────────────────────────────
# Run database migrations before starting the server. The prisma CLI is
# copied from the builder stage into node_modules/prisma, but the
# node_modules/.bin symlink doesn't survive the COPY, so we invoke the
# CLI directly via its entry point.
echo "→ Running Prisma migrations..."
MAX_RETRIES=10
RETRY_DELAY=3
n=0
until [ "$n" -ge "$MAX_RETRIES" ]; do
  node /app/node_modules/prisma/build/index.js migrate deploy \
    --schema=/app/lib/prisma/schema.prisma && break
  n=$((n + 1))
  echo "  Migration attempt $n failed. Retrying in ${RETRY_DELAY}s..."
  sleep "$RETRY_DELAY"
done
if [ "$n" -ge "$MAX_RETRIES" ]; then
  echo "✗ Migrations failed after $MAX_RETRIES attempts"
  exit 1
fi
echo "✓ Migrations complete"

# ── Start Server ───────────────────────────────────────────────────────
echo "→ Starting Next.js server..."
exec node server.js