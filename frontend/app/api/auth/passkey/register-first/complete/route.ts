import { NextResponse } from 'next/server';
import { verifyFirstTimePasskeyRegistration } from '@/lib/auth/webauthn';
import { signIn } from '@/lib/auth/auth';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { tempId, response } = body;

    if (!tempId || !response) {
      return NextResponse.json(
        { error: 'Missing tempId or registration response' },
        { status: 400 }
      );
    }

    const result = await verifyFirstTimePasskeyRegistration(tempId, response);

    if (!result.verified || !result.user) {
      return NextResponse.json(
        { error: 'Passkey registration verification failed' },
        { status: 401 }
      );
    }

    // Sign the user in
    await signIn('passkey', {
      userId: result.user.id,
      redirect: false,
    });

    return NextResponse.json({ verified: true, user: result.user });
  } catch (err: any) {
    console.error('Error completing first-time passkey registration:', err);
    return NextResponse.json(
      { error: err.message || 'Registration failed' },
      { status: 500 }
    );
  }
}