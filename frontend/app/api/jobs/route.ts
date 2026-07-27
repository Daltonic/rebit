import { NextRequest, NextResponse } from 'next/server';
import { getBackendUrl } from '@/lib/config';

/**
 * GET /api/jobs
 *
 * List all jobs (optionally filtered by user_id).
 * Proxies to backend: GET /api/jobs?user_id=...
 *
 * This exists so client components can call a same-origin path
 * (`/api/jobs`) instead of reaching for the backend directly.
 * A direct client-side fetch to the backend's own URL only works when
 * the browser and the backend are on the same machine — it breaks in
 * any environment where the app is viewed through a different host than
 * the one the backend is reachable at (a remote dev container, a
 * Codespace, a Docker Compose network, etc). Routing through here keeps
 * the backend URL resolution entirely server-side, via getBackendUrl().
 */
export async function GET(request: NextRequest) {
  try {
    const backendUrl = await getBackendUrl();
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('user_id');

    const url = userId
      ? `${backendUrl}/api/jobs?user_id=${encodeURIComponent(userId)}`
      : `${backendUrl}/api/jobs`;

    const res = await fetch(url);

    // Handle non-JSON error responses (e.g. FastAPI 500 plain text)
    let data;
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      data = await res.json();
    } else {
      const text = await res.text();
      data = { detail: text || `Backend returned status ${res.status}` };
    }

    if (!res.ok) {
      return NextResponse.json(
        { detail: data.detail || 'Failed to fetch jobs' },
        { status: res.status }
      );
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error('Error proxying jobs list to backend:', err);
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : 'Failed to fetch jobs' },
      { status: 500 }
    );
  }
}