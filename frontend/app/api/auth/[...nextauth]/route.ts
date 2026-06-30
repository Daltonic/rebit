import { handlers } from '@/lib/auth/auth';
import { NextRequest } from 'next/server';

/**
 * URL rewriting for Docker/Codespaces compatibility.
 * Replaces internal container hostname with the public origin
 * from Host / x-forwarded-host headers so OAuth redirect_uri matches.
 */
function rewriteUrl(request: NextRequest): NextRequest {
  const url = new URL(request.url);
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || url.host;
  const protocol = request.headers.get('x-forwarded-proto') || url.protocol.replace(':', '');
  const rewrittenUrl = `${protocol}://${host}${url.pathname}${url.search}`;

  return new NextRequest(rewrittenUrl, request);
}

export async function GET(request: NextRequest) {
  return handlers.GET(rewriteUrl(request));
}

export async function POST(request: NextRequest) {
  return handlers.POST(rewriteUrl(request));
}