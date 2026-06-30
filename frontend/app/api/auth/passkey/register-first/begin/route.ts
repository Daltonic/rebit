import { generateFirstTimePasskeyOptions } from '@/lib/auth/webauthn';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const { options, tempId } = await generateFirstTimePasskeyOptions();
    return NextResponse.json({ options, tempId });
  } catch (error) {
    console.error('Failed to generate first-time registration options:', error);
    return NextResponse.json(
      { error: 'Failed to start passkey registration.' },
      { status: 500 },
    );
  }
}