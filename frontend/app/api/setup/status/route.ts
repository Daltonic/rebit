import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import type { SetupStatus } from '@/lib/types';
import { invalidateSetupCache } from '@/proxy';

/**
 * GET /api/setup/status
 *
 * Returns the full setup status of the application.
 * Gracefully handles missing app_settings table.
 *
 * Response: SetupStatus
 */
export async function GET() {
  try {
    let settings = null;
    try {
      settings = await prisma.appSettings.findUnique({
        where: { id: 'default' },
      });
    } catch {
      // Table doesn't exist yet — return default unconfigured state
    }

    const body = !settings
      ? ({
          setupComplete: false,
          siaConnected: false,
          siaIndexerUrl: null,
          siaAppId: null,
          siaAppName: null,
          siaAppDescription: null,
          hasOpenrouterKey: false,
          hasGoogle: false,
          hasGitHub: false,
          hasWebauthn: false,
        } satisfies SetupStatus)
      : ({
          setupComplete: settings.setupComplete,
          siaConnected: settings.siaConnected,
          siaIndexerUrl: settings.siaIndexerUrl,
          siaAppId: settings.siaAppId,
          siaAppName: settings.siaAppName,
          siaAppDescription: settings.siaAppDescription,
          hasOpenrouterKey: !!settings.openrouterKey,
          hasGoogle: !!(settings.googleClientId && settings.googleClientSecret),
          hasGitHub: !!(settings.githubClientId && settings.githubClientSecret),
          hasWebauthn: !!(settings.webauthnRpId && settings.webauthnOrigin),
        } satisfies SetupStatus);

    return NextResponse.json(body, {
      headers: {
        // Prevent aggressive client-side caching — the proxy middleware
        // handles its own caching internally.
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (err) {
    console.error('Error fetching setup status:', err);
    return NextResponse.json(
      { error: 'Failed to fetch setup status' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/setup/status
 *
 * Marks the setup as complete.
 * Body: { setupComplete: boolean }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { setupComplete } = body;

    if (typeof setupComplete !== 'boolean') {
      return NextResponse.json(
        { error: 'setupComplete must be a boolean' },
        { status: 400 }
      );
    }

    await prisma.appSettings.upsert({
      where: { id: 'default' },
      update: { setupComplete },
      create: {
        id: 'default',
        setupComplete,
      },
    });

    // Invalidate the proxy middleware cache so subsequent requests
    // pick up the new setup status immediately.
    invalidateSetupCache();

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Error updating setup status:', err);
    return NextResponse.json(
      { error: 'Failed to update setup status' },
      { status: 500 }
    );
  }
}
