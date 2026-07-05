import { NextResponse } from 'next/server';
import { generateFirstTimePasskeyOptions } from '@/lib/auth/webauthn';

export async function GET() {
  try {
    const result = await generateFirstTimePasskeyOptions();
    return NextResponse.json(result);
  } catch (err: any) {
    console.error('Error generating first-time passkey options:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to start registration' },
      { status: 500 }
    );
  }
}