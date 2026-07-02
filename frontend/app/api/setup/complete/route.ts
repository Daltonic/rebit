import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';

/**
 * POST /api/setup/complete
 *
 * Marks the entire setup wizard as complete.
 * This is called after all setup steps (Sia, OpenRouter, Providers) are done.
 *
 * Body: { }
 *
 * Response: { ok: boolean }
 */
export async function POST() {
  try {
    await prisma.appSettings.upsert({
      where: { id: 'default' },
      update: { setupComplete: true },
      create: {
        id: 'default',
        setupComplete: true,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Error marking setup complete:', err);
    return NextResponse.json(
      { error: 'Failed to mark setup as complete' },
      { status: 500 }
    );
  }
}