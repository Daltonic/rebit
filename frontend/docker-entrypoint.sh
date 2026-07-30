#!/bin/sh
set -e

# ── Prisma Migrations ──────────────────────────────────────────────────
# Run database migrations before starting the server. The prisma CLI is
# copied from the builder stage into standalone's node_modules.
# We cd into the standalone directory so relative paths resolve correctly.
echo "→ Running Prisma migrations..."
MAX_RETRIES=10
RETRY_DELAY=3
n=0
cd /app/.next/standalone
until [ "$n" -ge "$MAX_RETRIES" ]; do
  node node_modules/prisma/build/index.js migrate deploy && break
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