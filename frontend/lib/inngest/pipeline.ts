/* eslint-disable @typescript-eslint/no-explicit-any */
import { inngest } from './client';

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:8000';

async function callBackend(path: string, body: object) {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Backend ${path} failed: ${await res.text()}`);
  return res.json();
}

// Each createFunction call uses 2-arg form: config + handler object
export const onJobCreated = (inngest.createFunction as any)(
  { id: 'rebit-transcribe', event: 'rebit/job.created' },
  async ({ event, step }: any) => {
    await step.run('transcribe', () => callBackend('/api/transcribe', { jobId: event.data.jobId }));
    await inngest.send({ name: 'rebit/job.uploaded', data: { jobId: event.data.jobId } });
  }
);

export const onJobUploaded = (inngest.createFunction as any)(
  { id: 'rebit-detect', event: 'rebit/job.uploaded' },
  async ({ event, step }: any) => {
    await step.run('detect', () => callBackend('/api/detect', { jobId: event.data.jobId }));
    await inngest.send({ name: 'rebit/job.transcribed', data: { jobId: event.data.jobId } });
  }
);

export const onJobTranscribed = (inngest.createFunction as any)(
  { id: 'rebit-extract', event: 'rebit/job.transcribed' },
  async ({ event, step }: any) => {
    await step.run('extract', () => callBackend('/api/extract', { jobId: event.data.jobId }));
    await inngest.send({ name: 'rebit/job.detected', data: { jobId: event.data.jobId } });
  }
);

export const onJobDetected = (inngest.createFunction as any)(
  { id: 'rebit-render', event: 'rebit/job.detected' },
  async ({ event, step }: any) => {
    await step.run('render', () => callBackend('/api/render', { jobId: event.data.jobId }));
    await inngest.send({ name: 'rebit/job.extracted', data: { jobId: event.data.jobId } });
  }
);

export const onJobExtracted = (inngest.createFunction as any)(
  { id: 'rebit-store', event: 'rebit/job.extracted' },
  async ({ event, step }: any) => {
    try {
      await step.run('store', () => callBackend('/api/sia', { jobId: event.data.jobId }));
    } catch (err) {
      console.error('Sia storage failed (non-fatal):', err);
    }
    await inngest.send({ name: 'rebit/job.rendered', data: { jobId: event.data.jobId } });
  }
);
