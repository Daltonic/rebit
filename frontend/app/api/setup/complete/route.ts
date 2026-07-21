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
 * Body: { }
 *
 * Response: { ok: boolean }
 */
export async function POST() {
  try {
    // Generate a cryptographically secure auth secret
    const authSecret = randomBytes(32).toString('hex');

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