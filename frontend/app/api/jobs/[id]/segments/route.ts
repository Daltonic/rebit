import { NextRequest, NextResponse } from 'next/server';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: jobId } = await params;
  const { segmentId, status } = await req.json() as { segmentId: string; status: 'approved' | 'rejected' };
  if (!['approved', 'rejected'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 422 });
  }
  // TODO: update segment status in PostgreSQL via Prisma
  return NextResponse.json({ segmentId, status });
}
