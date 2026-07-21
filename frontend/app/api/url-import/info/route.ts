import { NextRequest, NextResponse } from 'next/server';
import { getBackendUrl } from '@/lib/config';

/**
 * POST /api/url-import/info
 *
 * Fetch metadata about a video URL without downloading.
 * Proxies to backend: POST /api/url-import/info
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const backendUrl = await getBackendUrl();

    const res = await fetch(`${backendUrl}/api/url-import/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      // Allow up to 30 seconds for info extraction
      signal: AbortSignal.timeout(30_000),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error('Error proxying URL info request to backend:', err);
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : 'Failed to fetch video info' },
      { status: 500 }
    );
  }
}