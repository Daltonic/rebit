import { NextRequest } from 'next/server';
import { getBackendUrl } from '@/lib/config';

// SSE responses must never be cached or statically optimized.
export const dynamic = 'force-dynamic';

/**
 * GET /api/jobs/[jobId]/events
 *
 * Proxies the backend's SSE stream for a job's pipeline progress.
 *
 * Why this exists: `usePipelineSSE` previously connected the BROWSER
 * directly to `${NEXT_PUBLIC_BACKEND_URL}/api/jobs/{jobId}/events`. That
 * works on a laptop where "localhost:8000" means the same thing to both
 * the browser and the server, but it fails immediately in Codespaces,
 * Docker Compose, or any setup where the backend isn't reachable from
 * the browser's network namespace — the EventSource just throws
 * NetworkError over and over until the hook gives up and falls back to
 * polling. Every other job/data fetch in this app already goes through
 * a Next.js proxy route for exactly this reason (see
 * app/api/jobs/[jobId]/route.ts) — this route brings SSE in line with
 * that pattern. The Next.js *server*, unlike the browser, can resolve
 * getBackendUrl() the same way the other proxy routes already do.
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ jobId: string }> },
) {
    const { jobId } = await params;
    const backendUrl = await getBackendUrl();

    let backendRes: Response;
    try {
        backendRes = await fetch(`${backendUrl}/api/jobs/${jobId}/events`, {
            headers: { Accept: 'text/event-stream' },
            // Cancel the upstream connection when the browser closes its end.
            signal: request.signal,
        });
    } catch (err) {
        console.error(`SSE proxy: failed to reach backend for job ${jobId}:`, err);
        return new Response('Failed to reach backend', { status: 502 });
    }

    if (!backendRes.ok || !backendRes.body) {
        return new Response('Pipeline events stream unavailable', {
            status: backendRes.status || 502,
        });
    }

    // Pipe the backend's stream straight through to the browser.
    return new Response(backendRes.body, {
        status: 200,
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            // Disable any intermediary buffering (e.g. nginx) that would
            // otherwise hold events back instead of streaming them.
            'X-Accel-Buffering': 'no',
        },
    });
}