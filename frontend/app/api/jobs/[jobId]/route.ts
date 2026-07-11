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

    if (!res.ok) {
      const data = await res.json();
      return NextResponse.json(
        { detail: data.detail || 'Failed to delete job' },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error('Error proxying delete job to backend:', err);
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : 'Failed to delete job' },
      { status: 500 }
    );
  }
}