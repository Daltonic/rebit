import { NextResponse, NextFetchEvent } from 'next/server';
import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { prisma } from '@/lib/prisma/client';

// ── Setup Status Check ──────────────────────────────────────────────────
// We query the database directly on every request rather than caching,
// because the middleware and API route handlers run in separate module
// instances in Next.js. A module-level cache in the middleware would not
// be invalidated when route handlers call invalidateSetupCache(),
// causing stale reads that redirect users back to /setup even after
// completing the wizard. This is a single indexed lookup by primary key,
// so there is no meaningful performance penalty.

async function checkSetupComplete(): Promise<boolean> {
  try {
    // Query the database directly instead of fetching our own
    // /api/setup/status endpoint over HTTP. The middleware already
    // imports `prisma` (see above), which only works because this
    // runs in a Node.js-capable runtime — so there's no need to go
    // back out over the network to ask ourselves this question.
    // That self-fetch used to go through the public origin, which
    // breaks in GitHub Codespaces, behind reverse proxies, or on any
    // password-protected preview deployment, because a server-to-
    // server request has none of the browser's session/auth context.
    // A direct query has no such dependency and no port to guess at.
    const settings = await prisma.appSettings.findUnique({
      where: { id: 'default' },
      select: { setupComplete: true },
    });

    return !!settings?.setupComplete;
  } catch {
    // Table/DB not reachable yet (e.g. before first migration) — treat
    // as not set up.
    return false;
  }
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
    pathname.startsWith('/window.svg') ||
    pathname.startsWith('/screenshots');

  if (isPublicAsset) {
    return NextResponse.next();
  }

  // ── Setup check (skip for setup page and setup API) ───────────────
  if (pathname !== '/setup' && !pathname.startsWith('/api/setup')) {
    const setupComplete = await checkSetupComplete();
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
    pathname === '/whitepaper' ||
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
  matcher: ['/((?!api/auth|api/inngest|api/upload|_next/static|_next/image|favicon.ico|file.svg|globe.svg|next.svg|vercel.svg|window.svg|screenshots).*)'],
};