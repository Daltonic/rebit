import { verifyPasskeyAuthenticationResponse } from '@/lib/auth/webauthn';
import { signIn } from '@/lib/auth/auth';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { response } = await request.json();

    if (!response) {
      return NextResponse.json(
        { error: 'Missing response.' },
        { status: 400 },
      );
    }

    const result = await verifyPasskeyAuthenticationResponse(response);

    if (!result.verified || !result.user) {
      return NextResponse.json(
        { error: 'Passkey authentication failed.' },
        { status: 401 },
      );
    }

    // Create a NextAuth session using the passkey credentials provider
    const signInResult = await signIn('passkey', {
      userId: result.user.id,
      redirect: false,
    });

    if (signInResult?.error) {
      return NextResponse.json(
        { error: 'Failed to create session.' },
        { status: 500 },
      );
    }

    return NextResponse.json({
      verified: true,
      user: result.user,
    });
  } catch (error: any) {
    console.error('Failed to verify authentication:', error);
    return NextResponse.json(
      { error: error.message || 'Passkey authentication failed.' },
      { status: 400 },
    );
  }
}