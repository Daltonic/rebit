import { verifyFirstTimePasskeyRegistration } from '@/lib/auth/webauthn';
import { signIn } from '@/lib/auth/auth';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { response, tempId } = await request.json();

    if (!response || !tempId) {
      return NextResponse.json(
        { error: 'Missing response or tempId.' },
        { status: 400 },
      );
    }

    const result = await verifyFirstTimePasskeyRegistration(tempId, response);

    if (!result.verified || !result.user) {
      return NextResponse.json(
        { error: 'Passkey registration verification failed.' },
        { status: 400 },
      );
    }

    // Create a NextAuth session for the new user
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

    return NextResponse.json({ verified: true, user: result.user });
  } catch (error: any) {
    console.error('Failed to verify first-time registration:', error);
    return NextResponse.json(
      { error: error.message || 'Passkey registration failed.' },
      { status: 400 },
    );
  }
}