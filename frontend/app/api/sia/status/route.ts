import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';

/**
 * GET /api/sia/status
 *
 * Returns the current Sia connection state.
 * Proxies through the backend (which owns the Sia SDK).
 * Gracefully handles missing app_settings table.
 *
 * Response: {
 *   connected: boolean,
 *   mode: 'live' | 'demo',
 *   reason: string | null,
 *   indexerUrl: string | null
 * }
 */
export async function GET() {
  try {
    let indexerUrl: string | null = null;
    try {
      const settings = await prisma.appSettings.findUnique({
        where: { id: 'default' },
      });
      indexerUrl = settings?.siaIndexerUrl || null;
    } catch {
      // Table doesn't exist yet — return demo mode
    }

    // Get status from backend (which owns the Sia SDK)
    const backendUrl = process.env.BACKEND_URL || 'http://backend:8000';
    let connected = false;
    let mode: 'live' | 'demo' = 'demo';
    let reason: string | null = 'Backend unreachable';

    try {
      const backendResponse = await fetch(`${backendUrl}/api/sia/status`);
      if (backendResponse.ok) {
        const data = await backendResponse.json();
        connected = data.connected;
        mode = data.mode === 'live' ? 'live' : 'demo';
        reason = data.reason || null;
        indexerUrl = data.indexer_url || indexerUrl;
      }
    } catch {
      // Backend unreachable — return demo mode
    }

    return NextResponse.json({
      connected,
      mode,
      reason,
      indexerUrl,
    });
  } catch (err) {
    console.error('Error fetching Sia status:', err);
    return NextResponse.json(
      {
        connected: false,
        mode: 'demo' as const,
        reason: 'Failed to check Sia status',
        indexerUrl: null,
      },
      { status: 500 }
    );
  }
}