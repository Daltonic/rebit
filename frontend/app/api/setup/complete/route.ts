import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { prisma } from '@/lib/prisma/client';
import { invalidateSetupCache } from '@/proxy';
import { invalidateConfigCache } from '@/lib/config';

/**
 * POST /api/setup/complete
 *
 * Marks the entire setup wizard as complete.
 * Generates and persists the NextAuth secret to the database so that
 * no AUTH_SECRET environment variable is required.
 *
 * IMPORTANT: This route can be called more than once (retries, a user
 * double-clicking "Create your account", a client-side redirect loop,
 * etc). The auth secret must only ever be generated ONCE and reused on
 * every subsequent call. Regenerating it on every call invalidates
 * every session cookie that was signed with the previous secret, and
 * -- worse -- different Next.js module instances (middleware, route
 * handlers, SSR layouts) each cache their own NextAuth instance the
 * first time they need it. If the secret changes between when one
 * instance caches it and when another does, they end up disagreeing
 * about the secret, and you get "no matching decryption secret" for
 * sessions that should be perfectly valid.
 *
 * Body: { }
 *
 * Response: { ok: boolean }
 */
export async function POST() {
  try {
    // Reuse the existing secret if setup has already run before.
    // Only generate a new one the first time.
    const existing = await prisma.appSettings.findUnique({
      where: { id: 'default' },
      select: { authSecret: true },
    });

    const authSecret = existing?.authSecret ?? randomBytes(32).toString('hex');

    await prisma.appSettings.upsert({
      where: { id: 'default' },
      update: {
        setupComplete: true,
        authSecret,
      },
      create: {
        id: 'default',
        setupComplete: true,
        authSecret,
      },
    });

    // Invalidate both caches so subsequent requests pick up the new values
    invalidateSetupCache();
    invalidateConfigCache();

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Error marking setup complete:', err);
    return NextResponse.json(
      { error: 'Failed to mark setup as complete' },
      { status: 500 }
    );
  }
}