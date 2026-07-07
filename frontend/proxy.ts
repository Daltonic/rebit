import { NextResponse, NextFetchEvent } from 'next/server';
import type { NextRequest } from 'next/server';
import NextAuth from 'next-auth';
import { authConfig } from '@/lib/auth/auth.config';
import { prisma } from '@/lib/prisma/client';

// ── Setup Status Cache ──────────────────────────────────────────────────
// The setup status only changes during the initial setup flow, so we cache
// it aggressively to avoid hammering the API on every single request.
let cachedSetupComplete: boolean | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 10_000; // 10 seconds

async function checkSetupComplete(baseUrl: string): Promise<boolean> {
  const now = Date.now();

  // Return cached value if still fresh
  if (cachedSetupComplete !== null && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedSetupComplete;
  }

  try {
    const res = await fetch(`${baseUrl}/api/setup/status`, {
      signal: AbortSignal.timeout(5000),
    });

    if (res.ok) {
      const data = await res.json();
      cachedSetupComplete = !!data.setupComplete;
    } else {
      cachedSetupComplete = false;
    }
  } catch {
    cachedSetupComplete = false;
  }

  cacheTimestamp = now;
  return cachedSetupComplete;
}

// Invalidate the cache (called externally when setup status changes)
export function invalidateSetupCache() {
  cachedSetupComplete = null;
  cacheTimestamp = 0;
}

// ── Lazy Auth Middleware ─────────────────────────────────────────────────
// We create the auth middleware lazily so it can read the secret from the
// database rather than requiring AUTH_SECRET as an environment variable.
let authMiddlewareInstance: ReturnType<typeof NextAuth>['auth'] | null = null;

async function getAuthMiddleware() {
  if (authMiddlewareInstance) return authMiddlewareInstance;

  // Try to read the auth secret from the database first
  let secret: string | undefined;
  try {
    const settings = await prisma.appSettings.findUnique({
      where: { id: 'default' },
      select: { authSecret: true },
    });
    if (settings?.authSecret) {
      secret = settings.authSecret;
    }
  } catch {
    // DB unavailable — fall through to env var
  }

  // Fallback to environment variable
  if (!secret) {
    secret = process.env.AUTH_SECRET ?? undefined;
  }

  // If no secret is available at all, return a no-op middleware.
  // This handles the case during initial setup before the secret is
  // configured in the database or environment. Creating a NextAuth
  // instance without a secret would log a noisy MissingSecret error.
  if (!secret) {
    const noop = async () => NextResponse.next();
    authMiddlewareInstance = noop as unknown as ReturnType<typeof NextAuth>['auth'];
    return authMiddlewareInstance;
  }

  const instance = NextAuth({
    ...authConfig,
    secret,
  });

  authMiddlewareInstance = instance.auth;
  return authMiddlewareInstance;
}

/**
 * Proxy that checks both setup completion and authentication.
 *
 * 1. If setup is not complete, redirect to /setup (unless already there).
 * 2. If setup is complete, delegate to NextAuth for auth checks.
 */
export default async function proxy(
  request: NextRequest,
  event: NextFetchEvent,
) {
  const { pathname } = request.nextUrl;

  // ── Always allow these paths through ──────────────────────────────
  const isPublicAsset =
    pathname.startsWith('/_next/static') ||
    pathname.startsWith('/_next/image') ||
    pathname === '/favicon.ico' ||
    pathname.startsWith('/file.svg') ||
    pathname.startsWith('/globe.svg') ||
    pathname.startsWith('/next.svg') ||
    pathname.startsWith('/vercel.svg') ||
    pathname.startsWith('/window.svg');

  if (isPublicAsset) {
    return NextResponse.next();
  }

  // ── Setup check (skip for setup page and setup API) ───────────────
  if (pathname !== '/setup' && !pathname.startsWith('/api/setup')) {
    const setupComplete = await checkSetupComplete(request.nextUrl.origin);
    if (!setupComplete) {
      return NextResponse.redirect(new URL('/setup', request.url));
    }
  }

  // ── Skip auth middleware for setup-related paths ──────────────────
  // During setup, there are no users yet, so auth checks would fail.
  // The setup wizard is pre-auth by design.
  if (
    pathname === '/setup' ||
    pathname.startsWith('/api/setup') ||
    pathname === '/login' ||
    pathname.startsWith('/api/auth')
  ) {
    return NextResponse.next();
  }

  // ── Delegate to NextAuth for auth checks ─────────────────────────
  try {
    const authMiddleware = await getAuthMiddleware();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return authMiddleware(request as any, event as any);
  } catch (err) {
    console.error('Auth middleware error:', err);
    // If auth middleware fails (e.g. no secret configured yet), allow the
    // request through — the page component will handle the unauthenticated state.
    return NextResponse.next();
  }
}

export const config = {
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico|file.svg|globe.svg|next.svg|vercel.svg|window.svg).*)'],
};