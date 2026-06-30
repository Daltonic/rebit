import { generatePasskeyAuthenticationOptions } from '@/lib/auth/webauthn';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const options = await generatePasskeyAuthenticationOptions();
    return NextResponse.json({ options });
  } catch (error) {
    console.error('Failed to generate authentication options:', error);
    return NextResponse.json(
      { error: 'Failed to start passkey authentication.' },
      { status: 500 },
    );
  }
}