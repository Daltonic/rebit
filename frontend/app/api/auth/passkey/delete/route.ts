import { auth } from '@/lib/auth/auth';
import { prisma } from '@/lib/prisma/client';
import { NextResponse } from 'next/server';

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { credentialId } = await request.json().catch(() => ({}));

    if (credentialId) {
      // Delete specific passkey (scoped to user)
      const passkey = await prisma.passkey.findFirst({
        where: { credentialId, userId: session.user.id },
      });

      if (!passkey) {
        return NextResponse.json(
          { error: 'Passkey not found.' },
          { status: 404 },
        );
      }

      await prisma.passkey.delete({ where: { id: passkey.id } });
      return NextResponse.json({ removed: true, message: 'Passkey removed.' });
    }

    // Legacy: delete all passkeys for the user
    await prisma.passkey.deleteMany({
      where: { userId: session.user.id },
    });

    return NextResponse.json({ removed: true, message: 'All passkeys removed.' });
  } catch (error) {
    console.error('Failed to remove passkey:', error);
    return NextResponse.json(
      { error: 'Failed to remove passkey.' },
      { status: 500 },
    );
  }
}