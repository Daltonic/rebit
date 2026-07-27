import { NextRequest, NextResponse } from 'next/server';
import { getBackendUrl } from '@/lib/config';

export const dynamic = 'force-dynamic';

/**
 * GET /api/jobs/[jobId]/start-pipeline?start_from=...
 *
 * Proxies the "retry from here" request to the backend. See
 * app/api/jobs/[jobId]/events/route.ts for why this proxy exists at
 * all: PipelineTracker.tsx used to call BACKEND_URL directly from the
 * browser, which only works when the backend is reachable from the
 * browser's own network — not true in Codespaces/Docker/remote dev.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params;
  const backendUrl = await getBackendUrl();
  const search = request.nextUrl.search; // includes leading "?" if present

  try {
    const res = await fetch(`${backendUrl}/api/jobs/${jobId}/start-pipeline${search}`);
    const data = await res.json().catch(() => null);
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error(`start-pipeline proxy: failed to reach backend for job ${jobId}:`, err);
    return NextResponse.json({ error: 'Failed to reach backend' }, { status: 502 });
  }
}