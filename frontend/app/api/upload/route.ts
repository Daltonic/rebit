import { NextRequest, NextResponse } from 'next/server';
import { getBackendUrl } from '@/lib/config';
import { auth } from '@/lib/auth/auth';

/**
 * POST /api/upload
 *
 * Upload a video file to the backend for processing.
 * Forwards the multipart form data as-is, including the user ID.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    const userId = session?.user?.id;

    const backendUrl = await getBackendUrl();
    const formData = await request.formData();

    // Append userId to the form data so the backend can associate the job
    if (userId) {
      formData.append('user_id', userId);
    }

    const res = await fetch(`${backendUrl}/api/upload`, {
      method: 'POST',
      body: formData,
      // Large file uploads need a generous timeout
      signal: AbortSignal.timeout(600_000),
    });

    // Read the response body as text first, then try to parse as JSON.
    // The backend may return a plain-text error (e.g. FastAPI's default
    // "Internal Server Error") which would crash res.json().
    const bodyText = await res.text();
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(bodyText);
    } catch {
      data = { detail: bodyText || 'Upload failed' };
    }

    if (!res.ok) {
      return NextResponse.json(
        { detail: (data.detail as string) || bodyText || 'Upload failed' },
        { status: res.status }
      );
    }

    return NextResponse.json(data as Record<string, unknown>);
  } catch (err) {
    console.error('Error proxying upload to backend:', err);
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      return NextResponse.json(
        { detail: 'Upload timed out. The file may be too large.' },
        { status: 504 }
      );
    }
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : 'Upload failed' },
      { status: 500 }
    );
  }
}