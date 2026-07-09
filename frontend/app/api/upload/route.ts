import { NextRequest, NextResponse } from 'next/server';
import { getBackendUrl } from '@/lib/config';

/**
 * POST /api/upload
 *
 * Upload a video file to the backend for processing.
 * Forwards the multipart form data as-is.
 */
export async function POST(request: NextRequest) {
  try {
    const backendUrl = await getBackendUrl();
    const formData = await request.formData();

    const res = await fetch(`${backendUrl}/api/upload`, {
      method: 'POST',
      body: formData,
      // Large file uploads need a generous timeout
      signal: AbortSignal.timeout(600_000),
    });

    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json(
        { detail: data.detail || 'Upload failed' },
        { status: res.status }
      );
    }

    return NextResponse.json(data);
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