import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { generatePasskeyRegistrationOptions } from '@/lib/auth/webauthn';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const options = await generatePasskeyRegistrationOptions(
      session.user.id!,
      session.user.email || '',
      session.user.name || 'User',
    );

    return NextResponse.json(options);
  } catch (err: any) {
    console.error('Error generating passkey registration options:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to start registration' },
      { status: 500 }
    );
  }
}