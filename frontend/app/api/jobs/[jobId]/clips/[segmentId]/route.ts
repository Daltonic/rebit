import { NextRequest, NextResponse } from 'next/server';
import { getBackendUrl } from '@/lib/config';

/**
 * GET /api/jobs/{jobId}/clips/{segmentId}
 *
 * Serve a clip video file for playback. Proxies to the backend which
 * handles Sia downloads, local file serving, and HTTP Range requests
 * (required for HTML5 video seeking).
 *
 * This exists so client components can call a same-origin path
 * (`/api/jobs/{jobId}/clips/{segmentId}`) instead of reaching for the
 * backend directly. A direct client-side fetch to the backend's own URL
 * only works when the browser and the backend are on the same machine —
 * it breaks in any environment where the app is viewed through a different
 * host than the one the backend is reachable at (a remote dev container,
 * a Codespace, a Docker Compose network, etc). Routing through here keeps
 * the backend URL resolution entirely server-side, via getBackendUrl().
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string; segmentId: string }> }
) {
  const { jobId, segmentId } = await params;

  try {
    const backendUrl = await getBackendUrl();
    const backendRes = await fetch(
      `${backendUrl}/api/jobs/${jobId}/clips/${segmentId}`,
      {
        headers: {
          // Forward the Range header so the backend can serve partial content
          ...(request.headers.get('range')
            ? { range: request.headers.get('range')! }
            : {}),
        },
      }
    );

    if (!backendRes.ok) {
      let detail: string;
      const contentType = backendRes.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await backendRes.json();
        detail = data.detail || `Backend returned status ${backendRes.status}`;
      } else {
        const text = await backendRes.text();
        detail = text || `Backend returned status ${backendRes.status}`;
      }
      return NextResponse.json({ detail }, { status: backendRes.status });
    }

    // Stream the response body back with the same content-type and headers
    const body = backendRes.body;
    if (!body) {
      return NextResponse.json(
        { detail: 'Backend returned empty body' },
        { status: 502 }
      );
    }

    // Build response headers, forwarding key headers from the backend
    const responseHeaders = new Headers();
    const forwardHeaders = [
      'content-type',
      'content-length',
      'content-range',
      'accept-ranges',
    ];
    for (const h of forwardHeaders) {
      const value = backendRes.headers.get(h);
      if (value) responseHeaders.set(h, value);
    }

    return new Response(body, {
      status: backendRes.status,
      headers: responseHeaders,
    });
  } catch (err) {
    console.error('Error proxying clip fetch to backend:', err);
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : 'Failed to fetch clip' },
      { status: 500 }
    );
  }
}