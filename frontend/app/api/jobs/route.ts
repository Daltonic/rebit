import { NextRequest, NextResponse } from 'next/server';
import { inngest } from '@/lib/inngest/client';
// import { prisma } from '@/lib/prisma/client'; // wire up when DB is ready
import { createId } from '@paralleldrive/cuid2';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

    const allowed = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska'];
    if (!allowed.includes(file.type)) {
      return NextResponse.json({ error: 'Unsupported file type' }, { status: 422 });
    }

    const maxBytes = 5 * 1024 * 1024 * 1024;
    if (file.size > maxBytes) {
      return NextResponse.json({ error: 'File exceeds 5 GB limit' }, { status: 413 });
    }

    const jobId = `job_${createId()}`;

    // TODO: write file to shared Docker volume at /data/uploads/{jobId}/{filename}
    // TODO: create job record in PostgreSQL via Prisma

    // Fire Inngest event to start the pipeline
    await inngest.send({
      name: 'rebit/job.created',
      data: { jobId, filename: file.name, size: file.size },
    });

    return NextResponse.json({ jobId }, { status: 201 });
  } catch (err) {
    console.error('Job creation failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET() {
  // TODO: return jobs from PostgreSQL via Prisma
  return NextResponse.json({ jobs: [] });
}
