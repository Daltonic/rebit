import { NextRequest, NextResponse } from 'next/server';
import { getBackendUrl } from '@/lib/config';

/**
 * GET /api/url-import/cookies
 *
 * Check whether YouTube cookies have been configured.
 * Proxies to backend: GET /api/url-import/cookies
 */
export async function GET() {
  try {
    const backendUrl = await getBackendUrl();
    const res = await fetch(`${backendUrl}/api/url-import/cookies`);
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error('Error fetching cookies status from backend:', err);
    return NextResponse.json(
      { hasCookies: false, cookiePath: '', cookieSize: 0, updatedAt: null },
      { status: 200 }
    );
  }
}

/**
 * POST /api/url-import/cookies
 *
 * Upload a cookies.txt file.
 * Forwards the file as a multipart upload to the backend.
 */
export async function POST(request: NextRequest) {
  try {
    const backendUrl = await getBackendUrl();

    // The request is a FormData with a 'file' field — forward it as-is to the backend
    const formData = await request.formData();

    const res = await fetch(`${backendUrl}/api/url-import/cookies`, {
      method: 'POST',
      body: formData,
    });

    const data = await res.json();

    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error('Error uploading cookies to backend:', err);
    return NextResponse.json(
      { ok: false, detail: err instanceof Error ? err.message : 'Failed to upload cookies' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/url-import/cookies
 *
 * Remove the stored cookies file.
 * Proxies to backend: DELETE /api/url-import/cookies
 */
export async function DELETE() {
  try {
    const backendUrl = await getBackendUrl();
    const res = await fetch(`${backendUrl}/api/url-import/cookies`, {
      method: 'DELETE',
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error('Error deleting cookies from backend:', err);
    return NextResponse.json(
      { ok: false, detail: err instanceof Error ? err.message : 'Failed to delete cookies' },
      { status: 500 }
    );
  }
}