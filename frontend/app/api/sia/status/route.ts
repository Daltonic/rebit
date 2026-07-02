import { NextResponse } from 'next/server';
import { getStatus } from '@/lib/sia/client';
import { prisma } from '@/lib/prisma/client';

/**
 * GET /api/sia/status
 *
 * Returns the current Sia connection state.
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

    const status = getStatus();

    return NextResponse.json({
      connected: status.connected,
      mode: status.demoMode ? ('demo' as const) : ('live' as const),
      reason: status.reason,
      indexerUrl: indexerUrl || status.indexerUrl || null,
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