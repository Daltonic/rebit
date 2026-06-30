'use client';
import { use } from 'react';
import Link from 'next/link';
import { mockJobs } from '@/lib/mock/data';
import PipelineTracker from '@/components/PipelineTracker';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { JobStatus } from '@/lib/types';

function formatDuration(s: number | null) {
  if (!s) return '—';
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
}

const STATUS_LABEL: Record<JobStatus, string> = {
  uploading: 'Uploading',
  transcribing: 'Transcribing audio',
  detecting: 'Detecting highlights',
  extracting: 'Extracting clips',
  rendering: 'Rendering 9:16',
  storing: 'Saving to Sia',
  complete: 'Complete',
  failed: 'Failed',
};

export default function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const job = mockJobs.find(j => j.id === id);

  if (!job) return (
    <div className="max-w-2xl mx-auto px-4 py-16 text-center">
      <p style={{ color: 'var(--text-muted)' }}>Job not found.</p>
      <Link href="/projects" className="mt-3 inline-block text-sm" style={{ color: 'var(--accent-bright)' }}>← Back to projects</Link>
    </div>
  );

  const steps = job.pipelineSteps ?? [];
  const isComplete = job.status === 'complete';

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 sm:py-8">
      {/* Back */}
      <Link href="/projects" className="inline-flex items-center gap-1.5 text-sm mb-6 transition-colors"
        style={{ color: 'var(--text-muted)' }}>
        <ArrowLeft size={13} /> Projects
      </Link>

      <div className="grid gap-5 md:grid-cols-[1fr_260px]">
        {/* Pipeline */}
        <div className="space-y-5 order-2 md:order-1">
          <div>
            <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)', letterSpacing: '-0.025em' }}>
              {STATUS_LABEL[job.status]}
            </h1>
            <p className="text-sm mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>{job.sourceFilename}</p>
          </div>

          <PipelineTracker steps={steps} />

          {isComplete && (
            <Link href={`/projects/${job.id}/clips`}
              className="flex items-center justify-between gap-3 px-5 py-4 rounded-xl transition-all hover:scale-[1.01]"
              style={{ background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.3)' }}>
              <div className="min-w-0">
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Review clips</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {job._count?.segments ?? 0} clips ready to approve or reject
                </p>
              </div>
              <ArrowRight size={16} className="flex-shrink-0" style={{ color: 'var(--accent-bright)' }} />
            </Link>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-3 order-1 md:order-2">
          <div className="rounded-xl p-4 space-y-3" style={{ border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
            <h2 className="text-xs uppercase" style={{ color: 'var(--text-muted)', fontFamily: 'var(--mono)', letterSpacing: '0.08em', fontSize: '10px' }}>
              Source Video
            </h2>
            {job.sourceUrl && (
              <div className="rounded-lg overflow-hidden" style={{ aspectRatio: '16 / 9' }}>
                <video
                  src={job.sourceUrl}
                  controls
                  preload="metadata"
                  className="w-full h-full object-cover"
                  style={{ background: '#000' }}
                />
              </div>
            )}
            <div className="space-y-2 text-xs" style={{ fontFamily: 'var(--mono)' }}>
              {[
                { label: 'File', value: job.sourceFilename },
                { label: 'Duration', value: formatDuration(job.durationSeconds) },
                { label: 'Job ID', value: job.id },
                { label: 'Sia ID', value: job.sourceSiaObjectId ?? 'not stored' },
              ].map(({ label, value }) => (
                <div key={label}>
                  <span style={{ color: 'var(--text-muted)' }}>{label}</span>
                  <p className="truncate mt-0.5" style={{ color: 'var(--text-secondary)' }}>{value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
