import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  // TODO: fetch job by id from PostgreSQL via Prisma
  return NextResponse.json({ id }, { status: 200 });
}
