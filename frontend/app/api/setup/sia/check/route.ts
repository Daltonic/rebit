import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { registrationCheck, getStatus } from '@/lib/sia/client';

/**
 * POST /api/setup/sia/check
 *
 * Checks if the user has approved the app on the Sia indexer.
 * If approved, updates the database and returns success.
 *
 * Body: { }
 * (Uses the config already stored in DB and the in-memory registration flow)
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

    // Check approval status
    const result = await registrationCheck({
      indexerUrl: settings.siaIndexerUrl,
      appId: settings.siaAppId,
    });

    // If approved, update the database
    if (result.ok && result.status === 'approved') {
      await prisma.appSettings.update({
        where: { id: 'default' },
        data: { siaConnected: true },
      });
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