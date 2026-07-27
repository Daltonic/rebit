import { NextRequest, NextResponse } from 'next/server';
import { getBackendUrl } from '@/lib/config';

/**
 * GET /api/jobs/{jobId}/clips/{segmentId}/download
 *
 * Proxies a download request to the backend, which fetches the clip
 * from Sia (or local filesystem) and returns it with
 * `Content-Disposition: attachment` so the browser prompts the user
 * to save the file.
 *
 * This exists so client components can call a same-origin path
 * instead of reaching for the backend directly (same rationale as
 * the playback proxy in the parent route).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string; segmentId: string }> }
) {
  const { jobId, segmentId } = await params;

  try {
    const backendUrl = await getBackendUrl();
    const backendRes = await fetch(
      `${backendUrl}/api/jobs/${jobId}/clips/${segmentId}/download`,
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

    // Stream the response body back with the same content-type and
    // content-disposition headers so the browser triggers a download.
    const body = backendRes.body;
    if (!body) {
      return NextResponse.json(
        { detail: 'Backend returned empty body' },
        { status: 502 },
      );
    }

    const responseHeaders = new Headers();
    const forwardHeaders = [
      'content-type',
      'content-length',
      'content-disposition',
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
    console.error('Error proxying clip download to backend:', err);
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : 'Failed to download clip' },
      { status: 500 },
    );
  }
}