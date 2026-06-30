import { auth } from '@/lib/auth/auth';
import { prisma } from '@/lib/prisma/client';
import { NextResponse } from 'next/server';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ enrolled: false }, { status: 200 });
  }

  const passkeyCount = await prisma.passkey.count({
    where: { userId: session.user.id },
  });

  return NextResponse.json({ enrolled: passkeyCount > 0, count: passkeyCount });
}