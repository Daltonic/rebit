import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { invalidateSetupCache } from '@/proxy';
import { invalidateAuthCache } from '@/lib/auth/auth';

/**
 * GET /api/setup/providers
 *
 * Returns the current provider configuration.
 */
export async function GET() {
  try {
    let settings = null;
    try {
      settings = await prisma.appSettings.findUnique({
        where: { id: 'default' },
      });
    } catch {
      // Database not available yet (e.g. during initial setup before
      // migrations have run, or if DATABASE_URL is not configured).
      // Return default unconfigured state.
    }

    return NextResponse.json({
      hasGoogle: !!(settings?.googleClientId && settings?.googleClientSecret),
      hasGitHub: !!(settings?.githubClientId && settings?.githubClientSecret),
      hasWebauthn: !!(settings?.webauthnRpId && settings?.webauthnOrigin),
      webauthnRpId: settings?.webauthnRpId ?? null,
      webauthnOrigin: settings?.webauthnOrigin ?? null,
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

    // Invalidate the proxy middleware cache so subsequent requests
    // pick up the new provider status immediately.
    invalidateSetupCache();

    // Invalidate the cached NextAuth instance too. Without this, a
    // request that hit /api/auth/* before this save (e.g. the login
    // page fetching providers) would have already built and cached a
    // NextAuth instance without Google/GitHub, and it would keep
    // serving that stale instance for the rest of the process's life.
    invalidateAuthCache();

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Error saving provider config:', err);
    return NextResponse.json(
      { error: 'Failed to save provider configuration' },
      { status: 500 }
    );
  }
}