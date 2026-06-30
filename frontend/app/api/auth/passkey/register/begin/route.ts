import { auth } from '@/lib/auth/auth';
import { generatePasskeyRegistrationOptions } from '@/lib/auth/webauthn';
import { NextResponse } from 'next/server';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userEmail = session.user.email;
  if (!userEmail) {
    return NextResponse.json({ error: 'User has no email' }, { status: 400 });
  }

  try {
    const options = await generatePasskeyRegistrationOptions(
      session.user.id,
      session.user.name || userEmail,
      userEmail,
    );
    return NextResponse.json(options);
  } catch (error) {
    console.error('Failed to generate registration options:', error);
    return NextResponse.json(
      { error: 'Failed to start passkey registration.' },
      { status: 500 },
    );
  }
}