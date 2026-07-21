// src/app/api/auth/[...nextauth]/route.ts
//
// Rewrites the request URL with the public origin from forwarded headers
// before passing to NextAuth. In Docker / Codespaces, req.url may contain
// an internal container hostname, which breaks the OAuth redirect_uri
// NextAuth builds from it. This ensures the redirect_uri always matches
// the actual public-facing host.

import { handlers } from '@/lib/auth/auth';
import { NextRequest } from 'next/server';

function rewriteUrl(req: NextRequest): NextRequest {
  const host =
    req.headers.get('x-forwarded-host') ??
    req.headers.get('host') ??
    'localhost:3000';

  const proto =
    req.headers.get('x-forwarded-proto') ??
    (host.includes('localhost') || host.includes('0.0.0.0') ? 'http' : 'https');

  const url = new URL(req.url);
  const publicOrigin = `${proto}://${host}`;

  if (url.origin !== publicOrigin) {
    const newUrl = `${publicOrigin}${url.pathname}${url.search}`;
    return new NextRequest(newUrl, req);
  }

  return req;
}

export const GET = (req: NextRequest) => handlers.GET(rewriteUrl(req));
export const POST = (req: NextRequest) => handlers.POST(rewriteUrl(req));
