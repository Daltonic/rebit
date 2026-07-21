import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { invalidateSetupCache } from '@/proxy';
import { getBackendUrl } from '@/lib/config';

/**
 * POST /api/setup/sia/check
 *
 * Checks if the user has approved the app on the Sia indexer.
 * Proxies through the backend (which owns the Sia SDK).
 * If approved, updates the database and returns success.
 *
 * Body: { }
 * (Uses the config already stored in DB and the backend's in-memory registration flow)
 *
 * Response: {
 *   ok: boolean,
 *   status?: 'approved' | 'pending',
 *   error?: string
 * }
 */
export async function POST() {
  try {
    // Get current Sia config from DB
    const settings = await prisma.appSettings.findUnique({
      where: { id: 'default' },
    });

    if (!settings?.siaIndexerUrl || !settings?.siaAppId) {
      return NextResponse.json(
        { ok: false, error: 'Sia not configured. Please complete the Sia setup step first.' },
        { status: 400 }
      );
    }

    // Proxy approval check through the backend
    const backendUrl = await getBackendUrl();
    const backendResponse = await fetch(
      `${backendUrl}/api/sia/register/check`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          indexer_url: settings.siaIndexerUrl,
          app_id: settings.siaAppId,
        }),
      }
    );

    const result = await backendResponse.json();

    // If approved, update the database
    if (result.ok && result.status === 'approved') {
      await prisma.appSettings.update({
        where: { id: 'default' },
        data: { siaConnected: true },
      });

      // Invalidate the proxy middleware cache so subsequent requests
      // pick up the new setup status immediately.
      invalidateSetupCache();
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error('Error checking Sia approval:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
