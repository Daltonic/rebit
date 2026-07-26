import { NextResponse, NextFetchEvent } from 'next/server';
import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';

// ── Setup Status Check ──────────────────────────────────────────────────
// We always fetch the setup status fresh rather than caching it, because
// the middleware and API route handlers run in separate module instances
// in Next.js. A module-level cache in the middleware would not be
// invalidated when route handlers call invalidateSetupCache(), causing
// stale reads that redirect users back to /setup even after completing
// the wizard. The /api/setup/status endpoint is a fast DB query, so
// there is no meaningful performance penalty.

async function checkSetupComplete(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/api/setup/status`, {
      signal: AbortSignal.timeout(5000),
    });

    if (res.ok) {
      const data = await res.json();
      return !!data.setupComplete;
    }
  } catch {
    // Fall through to false
  }

  return false;
}

// No-op — kept for backward compatibility with route handlers that import it.
// The middleware no longer caches, so invalidation is unnecessary.
export function invalidateSetupCache() {
  // no-op
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
  //
  // Also skip /api/upload — the upload route handles auth itself, and
  // we must avoid the middleware trying to read the multipart body
  // (Next.js limits middleware bodies to 10MB by default, which would
  // truncate large file uploads and corrupt the FormData boundary).
  if (
    pathname === '/setup' ||
    pathname.startsWith('/api/setup') ||
    pathname === '/login' ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/inngest') ||
    pathname.startsWith('/api/upload')
  ) {
    return NextResponse.next();
  }

  // ── Delegate to NextAuth for auth checks ─────────────────────────
  // We reuse the singleton auth() from lib/auth/auth.ts so that only ONE
  // NextAuth instance exists. Creating a second instance (even with the
  // same config) can cause cookie encryption mismatches — for example the
  // PKCE code verifier cookie set by the sign-in handler may fail to
  // parse during the OAuth callback.
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await auth(request as any, event as any);
    return response;
  } catch (err) {
    console.error('Auth middleware error:', err);
    // If auth middleware fails (e.g. no secret configured yet), allow the
    // request through — the page component will handle the unauthenticated state.
    return NextResponse.next();
  }
}

export const config = {
  // Exclude /api/upload from middleware (large multipart bodies are
  // truncated at 10MB by Next.js middleware, corrupting FormData).
  matcher: ['/((?!api/auth|api/inngest|api/upload|_next/static|_next/image|favicon.ico|file.svg|globe.svg|next.svg|vercel.svg|window.svg).*)'],
};
