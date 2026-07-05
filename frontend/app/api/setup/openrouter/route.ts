import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';

/**
 * POST /api/setup/openrouter
 *
 * Saves the OpenRouter API key to the database.
 *
 * Body: { openrouterKey: string }
 *
 * Response: { ok: boolean }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { openrouterKey } = body;

    if (!openrouterKey) {
      return NextResponse.json(
        { error: 'OpenRouter API key is required' },
        { status: 400 }
      );
    }

    await prisma.appSettings.upsert({
      where: { id: 'default' },
      update: { openrouterKey },
      create: {
        id: 'default',
        openrouterKey,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Error saving OpenRouter key:', err);
    return NextResponse.json(
      { error: 'Failed to save OpenRouter API key' },
      { status: 500 }
    );
  }
}