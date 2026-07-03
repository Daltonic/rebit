import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import NextAuth from 'next-auth';
import { authConfig } from '@/lib/auth/auth.config';

const authMiddleware = NextAuth(authConfig).auth;

/**
 * Proxy that checks both setup completion and authentication.
 *
 * 1. If setup is not complete, redirect to /setup (unless already there).
 * 2. If setup is complete, delegate to NextAuth for auth checks.
 */
export default async function proxy(
  request: NextRequest,
  event: any,
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
    try {
      const baseUrl = request.nextUrl.origin;
      const res = await fetch(`${baseUrl}/api/setup/status`, {
        signal: AbortSignal.timeout(5000),
      });

      if (res.ok) {
        const data = await res.json();
        if (!data.setupComplete) {
          return NextResponse.redirect(new URL('/setup', request.url));
        }
      } else {
        return NextResponse.redirect(new URL('/setup', request.url));
      }
    } catch {
      return NextResponse.redirect(new URL('/setup', request.url));
    }
  }

  // ── Delegate to NextAuth for auth checks ─────────────────────────
  return authMiddleware(request as any, event);
}

export const config = {
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico|file.svg|globe.svg|next.svg|vercel.svg|window.svg).*)'],
};