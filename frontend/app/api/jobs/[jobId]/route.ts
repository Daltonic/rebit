import { NextRequest, NextResponse } from 'next/server';
import { getBackendUrl } from '@/lib/config';

/**
 * GET /api/jobs/{jobId}
 *
 * Fetch a single job (status, pipeline steps, segments, transcript, Sia
 * logs). Proxies to backend: GET /api/jobs/{jobId}
 *
 * This exists so client components can call a same-origin path
 * (`/api/jobs/{jobId}`) instead of reaching for the backend directly.
 * A direct client-side fetch to the backend's own URL only works when
 * the browser and the backend are on the same machine — it breaks in
 * any environment where the app is viewed through a different host than
 * the one the backend is reachable at (a remote dev container, a
 * Codespace, a Docker Compose network, etc). Routing through here keeps
 * the backend URL resolution entirely server-side, via getBackendUrl().
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;

  try {
    const backendUrl = await getBackendUrl();
    const res = await fetch(`${backendUrl}/api/jobs/${jobId}`);

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
        { detail: data.detail || 'Failed to fetch job' },
        { status: res.status }
      );
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error('Error proxying job fetch to backend:', err);
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : 'Failed to fetch job' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/jobs/{jobId}
 *
 * Delete a job and all its related data.
 * Proxies to backend: DELETE /api/jobs/{jobId}
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;

  try {
    const backendUrl = await getBackendUrl();
    const res = await fetch(`${backendUrl}/api/jobs/${jobId}`, {
      method: 'DELETE',
    });

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
        { detail: data.detail || 'Failed to delete job' },
        { status: res.status }
      );
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error('Error proxying delete job to backend:', err);
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : 'Failed to delete job' },
      { status: 500 }
    );
  }
}