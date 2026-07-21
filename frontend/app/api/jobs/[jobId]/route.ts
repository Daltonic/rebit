import { NextRequest, NextResponse } from 'next/server';
import { getBackendUrl } from '@/lib/config';

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
    let data: any;
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
