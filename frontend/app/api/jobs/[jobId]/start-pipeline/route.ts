import { NextRequest, NextResponse } from 'next/server';
import { getBackendUrl } from '@/lib/config';

/**
 * GET /api/jobs/{jobId}/start-pipeline
 *
 * Manually start or resume the pipeline for a job.
 * Proxies to backend: GET /api/jobs/{jobId}/start-pipeline
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;

  try {
    const backendUrl = await getBackendUrl();
    const res = await fetch(`${backendUrl}/api/jobs/${jobId}/start-pipeline`, {
      signal: AbortSignal.timeout(30_000),
    });

    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json(
        { detail: data.detail || 'Failed to start pipeline' },
        { status: res.status }
      );
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error('Error proxying start-pipeline to backend:', err);
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : 'Failed to start pipeline' },
      { status: 500 }
    );
  }
}