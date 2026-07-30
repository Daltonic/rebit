#!/bin/sh
set -e

# ── Prisma Migrations ──────────────────────────────────────────────────
# Run database migrations before starting the server. The prisma CLI is
# copied from the builder stage into standalone's node_modules.
# We cd into the standalone directory so relative paths resolve correctly.
cd /app/.next/standalone
PRISMA="node node_modules/prisma/build/index.js"

run_migrate() {
  $PRISMA migrate deploy
}

# P3005 means the schema already has tables but no _prisma_migrations
# history — this happens here because the FastAPI backend (SQLAlchemy)
# can create its mirrored tables before this container's migrate deploy
# runs. It is NOT a transient error, so retrying it as one just burns
# through MAX_RETRIES and crash-loops the container. Instead, treat the
# existing tables as already matching our migrations and baseline them.
baseline_existing_schema() {
  echo "  P3005 detected: schema exists but has no migration history."
  echo "  Baselining by marking known migrations as already applied..."
  for dir in lib/prisma/migrations/*/; do
    [ -d "$dir" ] || continue
    name=$(basename "$dir")
    echo "    → resolving $name as applied"
    $PRISMA migrate resolve --applied "$name"
  done
}

echo "→ Running Prisma migrations..."
MAX_RETRIES=10
RETRY_DELAY=3
n=0
until [ "$n" -ge "$MAX_RETRIES" ]; do
  if output=$(run_migrate 2>&1); then
    echo "$output"
    break
  fi
  echo "$output"

  if echo "$output" | grep -q "P3005"; then
    baseline_existing_schema
    if output=$(run_migrate 2>&1); then
      echo "$output"
      break
    fi
    echo "$output"
  fi

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