import { NextResponse } from 'next/server';
import { verifyPasskeyAuthenticationResponse } from '@/lib/auth/webauthn';
import { signIn } from '@/lib/auth/auth';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { response } = body;

    if (!response) {
      return NextResponse.json(
        { error: 'Missing authentication response' },
        { status: 400 }
      );
    }

    const result = await verifyPasskeyAuthenticationResponse(response);

    if (!result.verified || !result.user) {
      return NextResponse.json(
        { error: 'Passkey verification failed' },
        { status: 401 }
      );
    }

    // Sign the user in using the credentials provider
    await signIn('passkey', {
      userId: result.user.id,
      redirect: false,
    });

    return NextResponse.json({ verified: true, user: result.user });
  } catch (err: any) {
    console.error('Error completing passkey auth:', err);
    return NextResponse.json(
      { error: err.message || 'Passkey verification failed' },
      { status: 500 }
    );
  }
}