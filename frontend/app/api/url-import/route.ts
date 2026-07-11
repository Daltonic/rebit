import { NextRequest, NextResponse } from 'next/server';
import { getBackendUrl } from '@/lib/config';
import { auth } from '@/lib/auth/auth';

/**
 * POST /api/url-import
 *
 * Import a video from a URL (YouTube, etc.).
 * Proxies to backend: POST /api/url-import
 *
 * This can take a while for large downloads, so we set a generous timeout.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    const userId = session?.user?.id;

    const body = await request.json();
    const backendUrl = await getBackendUrl();

    // Attach the authenticated user ID so the backend can associate the job
    const requestBody = userId ? { ...body, userId } : body;

    const res = await fetch(`${backendUrl}/api/url-import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      // Allow up to 10 minutes for download + processing
      signal: AbortSignal.timeout(600_000),
    });

    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json(
        { detail: data.detail || 'URL import failed' },
        { status: res.status }
      );
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error('Error proxying URL import request to backend:', err);
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      return NextResponse.json(
        { detail: 'Video download timed out. The video may be too long or the server is busy.' },
        { status: 504 }
      );
    }
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : 'Failed to import video from URL' },
      { status: 500 }
    );
  }
}