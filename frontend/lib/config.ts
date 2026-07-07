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
import fs from 'fs';

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
 * Returns 'http://localhost:8000' as the default if neither is available.
 *
 * IMPORTANT: If the database has a stale Docker-internal hostname (e.g.
 * "http://backend:8000") but the app is running outside Docker (no
 * container named "backend" is resolvable), the env var or localhost
 * fallback is used instead. This prevents ENOTFOUND errors when switching
 * between Docker Compose and local dev environments.
 */
export async function getBackendUrl(): Promise<string> {
  // Check cache first
  if (isCacheFresh() && cachedSettings) {
    return resolveBackendUrl(cachedSettings.backendUrl);
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
      return resolveBackendUrl(settings.backendUrl);
    }
  } catch {
    // DB unavailable — fall through to env var
  }

  return resolveBackendUrl(null);
}

/**
 * Resolve a backend URL candidate, replacing Docker-internal hostnames
 * with localhost when running outside a Docker container.
 */
function resolveBackendUrl(dbValue: string | null): string {
  const envValue = process.env.BACKEND_URL;
  const candidate = dbValue ?? envValue ?? 'http://localhost:8000';

  // If the candidate uses a Docker service hostname and we're NOT inside
  // Docker, replace it with localhost so the connection works.
  if (
    /https?:\/\/(backend|postgres|inngest|ollama)([:\/]|$)/i.test(candidate) &&
    !isRunningInDocker()
  ) {
    return candidate.replace(
      /\/\/(backend|postgres|inngest|ollama)/i,
      '//localhost',
    );
  }

  return candidate;
}

/** Quick check: are we running inside a Docker container? */
function isRunningInDocker(): boolean {
  try {
    return fs.existsSync('/.dockerenv');
  } catch {
    return false;
  }
}

/**
 * Invalidate the in-memory config cache.
 * Called after setup steps persist new values to the database.
 */
export function invalidateConfigCache() {
  cachedSettings = null;
  cacheTimestamp = 0;
}