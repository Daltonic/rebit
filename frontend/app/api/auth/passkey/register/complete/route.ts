import { auth } from '@/lib/auth/auth';
import { verifyPasskeyRegistrationResponse } from '@/lib/auth/webauthn';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const result = await verifyPasskeyRegistrationResponse(
      session.user.id,
      body,
      session.user.email || undefined,
    );
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Failed to verify registration:', error);
    return NextResponse.json(
      { error: error.message || 'Passkey registration failed.' },
      { status: 400 },
    );
  }
}