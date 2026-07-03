import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';

/**
 * GET /api/setup/providers
 *
 * Returns the current provider configuration.
 */
export async function GET() {
  try {
    const settings = await prisma.appSettings.findUnique({
      where: { id: 'default' },
    });

    if (!settings) {
      return NextResponse.json({
        hasGoogle: false,
        hasGitHub: false,
        hasWebauthn: false,
        webauthnRpId: null,
        webauthnOrigin: null,
      });
    }

    return NextResponse.json({
      hasGoogle: !!(settings.googleClientId && settings.googleClientSecret),
      hasGitHub: !!(settings.githubClientId && settings.githubClientSecret),
      hasWebauthn: !!(settings.webauthnRpId && settings.webauthnOrigin),
      webauthnRpId: settings.webauthnRpId,
      webauthnOrigin: settings.webauthnOrigin,
    });
  } catch (err) {
    console.error('Error fetching provider config:', err);
    return NextResponse.json(
      { error: 'Failed to fetch provider configuration' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/setup/providers
 *
 * Saves provider configuration to the database.
 *
 * Body: {
 *   googleClientId?: string,
 *   googleClientSecret?: string,
 *   githubClientId?: string,
 *   githubClientSecret?: string,
 *   webauthnRpId?: string,
 *   webauthnOrigin?: string,
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      googleClientId,
      googleClientSecret,
      githubClientId,
      githubClientSecret,
      webauthnRpId,
      webauthnOrigin,
    } = body;

    await prisma.appSettings.upsert({
      where: { id: 'default' },
      update: {
        ...(googleClientId !== undefined && { googleClientId }),
        ...(googleClientSecret !== undefined && { googleClientSecret }),
        ...(githubClientId !== undefined && { githubClientId }),
        ...(githubClientSecret !== undefined && { githubClientSecret }),
        ...(webauthnRpId !== undefined && { webauthnRpId }),
        ...(webauthnOrigin !== undefined && { webauthnOrigin }),
      },
      create: {
        id: 'default',
        googleClientId: googleClientId || null,
        googleClientSecret: googleClientSecret || null,
        githubClientId: githubClientId || null,
        githubClientSecret: githubClientSecret || null,
        webauthnRpId: webauthnRpId || null,
        webauthnOrigin: webauthnOrigin || null,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Error saving provider config:', err);
    return NextResponse.json(
      { error: 'Failed to save provider configuration' },
      { status: 500 }
    );
  }
}