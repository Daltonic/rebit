import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { prisma } from '@/lib/prisma/client';

export async function DELETE() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    await prisma.passkey.deleteMany({
      where: { userId: session.user.id },
    });

    return NextResponse.json({ message: 'Passkey removed successfully.' });
  } catch (err) {
    console.error('Error deleting passkey:', err);
    return NextResponse.json(
      { error: 'Failed to remove passkey.' },
      { status: 500 }
    );
  }
}