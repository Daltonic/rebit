import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { verifyPasskeyRegistrationResponse } from '@/lib/auth/webauthn';

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const result = await verifyPasskeyRegistrationResponse(
      session.user.id,
      body,
    );

    return NextResponse.json(result);
  } catch (err: any) {
    console.error('Error verifying passkey registration:', err);
    return NextResponse.json(
      { error: err.message || 'Registration verification failed' },
      { status: 500 }
    );
  }
}