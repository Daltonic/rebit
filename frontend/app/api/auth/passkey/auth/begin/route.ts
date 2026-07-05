import { NextResponse } from 'next/server';
import { generatePasskeyAuthenticationOptions } from '@/lib/auth/webauthn';

export async function GET() {
  try {
    const options = await generatePasskeyAuthenticationOptions();
    return NextResponse.json({ options });
  } catch (err: any) {
    console.error('Error generating passkey auth options:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to start authentication' },
      { status: 500 }
    );
  }
}