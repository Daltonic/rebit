import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { prisma } from '@/lib/prisma/client';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ enrolled: false });
    }

    const passkeyCount = await prisma.passkey.count({
      where: { userId: session.user.id },
    });

    return NextResponse.json({ enrolled: passkeyCount > 0 });
  } catch (err) {
    console.error('Error checking passkey status:', err);
    return NextResponse.json({ enrolled: false });
  }
}