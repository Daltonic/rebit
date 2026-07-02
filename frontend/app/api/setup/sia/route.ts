import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { registrationStart, initSiaClient, getStatus } from '@/lib/sia/client';

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
 * Saves Sia configuration to the database and starts the registration flow.
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

    // Initialize the Sia client with the new config
    await initSiaClient(
      siaIndexerUrl,
      siaAppId,
      siaAppName || 'ReBit',
      siaAppDescription || ''
    );

    // Check if already connected (e.g., stored key was valid)
    const status = getStatus();
    if (status.connected) {
      // Already connected — update DB and return success
      await prisma.appSettings.update({
        where: { id: 'default' },
        data: { siaConnected: true },
      });
      return NextResponse.json({
        ok: true,
        already_connected: true,
        approval_url: undefined,
      });
    }

    // Start registration flow
    const result = await registrationStart(recoveryPhrase, {
      indexerUrl: siaIndexerUrl,
      appId: siaAppId,
      appName: siaAppName || 'ReBit',
      appDescription: siaAppDescription || '',
    });

    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (err) {
    console.error('Error in Sia setup:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}