import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { invalidateSetupCache } from '@/proxy';

/**
 * GET /api/setup/sia
 *
 * Returns the current Sia configuration from AppSettings.
 */
export async function GET() {
  try {
    const settings = await prisma.appSettings.findUnique({
      where: { id: 'default' },
    });

    if (!settings) {
      return NextResponse.json({
        siaIndexerUrl: null,
        siaAppId: null,
        siaAppName: null,
        siaAppDescription: null,
        siaConnected: false,
      });
    }

    return NextResponse.json({
      siaIndexerUrl: settings.siaIndexerUrl,
      siaAppId: settings.siaAppId,
      siaAppName: settings.siaAppName,
      siaAppDescription: settings.siaAppDescription,
      siaConnected: settings.siaConnected,
    });
  } catch (err) {
    console.error('Error fetching Sia config:', err);
    return NextResponse.json(
      { error: 'Failed to fetch Sia configuration' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/setup/sia
 *
 * Saves Sia configuration to the database and proxies the registration
 * request to the backend (which owns the Sia SDK).
 *
 * The frontend NEVER talks to the Sia SDK or Sia indexer directly.
 *
 * Body: {
 *   siaIndexerUrl: string,
 *   siaAppId: string,
 *   siaAppName: string,
 *   siaAppDescription: string,
 *   recoveryPhrase: string
 * }
 *
 * Response: {
 *   ok: boolean,
 *   approval_url?: string,
 *   error?: string,
 *   already_connected?: boolean
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      siaIndexerUrl,
      siaAppId,
      siaAppName,
      siaAppDescription,
      recoveryPhrase,
      reconnect,
    } = body;

    // Validate required fields
    if (!siaIndexerUrl) {
      return NextResponse.json(
        { ok: false, error: 'Sia indexer URL is required' },
        { status: 400 }
      );
    }
    if (!siaAppId) {
      return NextResponse.json(
        { ok: false, error: 'Sia app ID is required' },
        { status: 400 }
      );
    }
    if (!siaAppName) {
      return NextResponse.json(
        { ok: false, error: 'Sia app name is required' },
        { status: 400 }
      );
    }
    if (!recoveryPhrase) {
      return NextResponse.json(
        { ok: false, error: 'BIP-39 recovery phrase is required' },
        { status: 400 }
      );
    }

    // Validate app ID format (64-char hex)
    if (!/^[0-9a-f]{64}$/i.test(siaAppId)) {
      return NextResponse.json(
        { ok: false, error: 'App ID must be a 64-character hex string (32 bytes)' },
        { status: 400 }
      );
    }

    const backendUrl = process.env.BACKEND_URL || 'http://backend:8000';

    // When reconnecting from the settings page, first disconnect the backend
    // so a fresh registration + approval flow can begin. Do NOT write to the
    // database until approval is confirmed (test of authenticity).
    if (reconnect) {
      try {
        await fetch(`${backendUrl}/api/sia/disconnect`, { method: 'POST' });
      } catch {
        // Best-effort — backend may be unreachable
      }
    } else {
      // Save config to database (mark siaConnected = false until registration completes)
      await prisma.appSettings.upsert({
        where: { id: 'default' },
        update: {
          siaIndexerUrl,
          siaAppId,
          siaAppName: siaAppName || 'ReBit',
          siaAppDescription: siaAppDescription || '',
          siaConnected: false,
        },
        create: {
          id: 'default',
          siaIndexerUrl,
          siaAppId,
          siaAppName: siaAppName || 'ReBit',
          siaAppDescription: siaAppDescription || '',
          siaConnected: false,
        },
      });
    }

    // Check if backend is already connected (stored AppKey fast-path)
    // by querying the backend's /api/sia/status
    let alreadyConnected = false;
    try {
      const statusRes = await fetch(`${backendUrl}/api/sia/status`);
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        if (statusData.connected) {
          alreadyConnected = true;
        }
      }
    } catch {
      // Backend unreachable — will fall through to registration
    }

    if (alreadyConnected) {
      if (!reconnect) {
        // Already connected — update DB and return success
        await prisma.appSettings.update({
          where: { id: 'default' },
          data: { siaConnected: true },
        });

        // Invalidate the proxy middleware cache so subsequent requests
        // pick up the new setup status immediately.
        invalidateSetupCache();
      }

      return NextResponse.json({
        ok: true,
        already_connected: true,
        approval_url: undefined,
      });
    }

    // Start registration via backend proxy
    // The backend owns the Sia SDK — the frontend never calls it directly
    const backendResponse = await fetch(
      `${backendUrl}/api/sia/register/init`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          indexer_url: siaIndexerUrl,
          app_id: siaAppId,
          app_name: siaAppName || 'ReBit',
          app_description: siaAppDescription || '',
          recovery_phrase: recoveryPhrase,
        }),
      }
    );

    const result = await backendResponse.json();
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (err) {
    console.error('Error in Sia setup:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}