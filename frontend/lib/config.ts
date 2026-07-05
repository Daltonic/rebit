/**
 * Database-backed configuration helper.
 *
 * Reads application settings from the `app_settings` table in the database,
 * falling back to environment variables when the DB is unavailable or the
 * value hasn't been persisted yet (e.g. during initial setup).
 *
 * Only `DATABASE_URL` is required as an environment variable — everything
 * else can be configured through the setup wizard and stored in the DB.
 */
import { prisma } from '@/lib/prisma/client';

// ── In-memory cache for hot-path reads ──────────────────────────────────
// The config only changes during setup, so we cache aggressively to avoid
// hammering the database on every request.
let cachedSettings: {
  authSecret: string | null;
  backendUrl: string | null;
} | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 10_000;

function isCacheFresh(): boolean {
  return (
    cachedSettings !== null &&
    Date.now() - cacheTimestamp < CACHE_TTL_MS
  );
}

/**
 * Read the auth secret from the database, falling back to AUTH_SECRET env var.
 * Returns null if neither is available.
 */
export async function getAuthSecret(): Promise<string | null> {
  // Check cache first
  if (isCacheFresh() && cachedSettings) {
    return cachedSettings.authSecret;
  }

  try {
    const settings = await prisma.appSettings.findUnique({
      where: { id: 'default' },
      select: { authSecret: true },
    });

    if (settings?.authSecret) {
      cachedSettings = {
        ...(cachedSettings ?? { backendUrl: null }),
        authSecret: settings.authSecret,
      };
      cacheTimestamp = Date.now();
      return settings.authSecret;
    }
  } catch {
    // DB unavailable — fall through to env var
  }

  // Fallback to environment variable
  return process.env.AUTH_SECRET ?? null;
}

/**
 * Read the backend URL from the database, falling back to BACKEND_URL env var.
 * Returns 'http://backend:8000' as the default if neither is available.
 */
export async function getBackendUrl(): Promise<string> {
  // Check cache first
  if (isCacheFresh() && cachedSettings) {
    return cachedSettings.backendUrl ?? process.env.BACKEND_URL ?? 'http://backend:8000';
  }

  try {
    const settings = await prisma.appSettings.findUnique({
      where: { id: 'default' },
      select: { backendUrl: true },
    });

    if (settings?.backendUrl) {
      cachedSettings = {
        ...(cachedSettings ?? { authSecret: null }),
        backendUrl: settings.backendUrl,
      };
      cacheTimestamp = Date.now();
      return settings.backendUrl;
    }
  } catch {
    // DB unavailable — fall through to env var
  }

  return process.env.BACKEND_URL ?? 'http://backend:8000';
}

/**
 * Invalidate the in-memory config cache.
 * Called after setup steps persist new values to the database.
 */
export function invalidateConfigCache() {
  cachedSettings = null;
  cacheTimestamp = 0;
}