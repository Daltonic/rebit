'use client';
import { use, useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import PipelineTracker from '@/components/PipelineTracker';
import { ArrowLeft, ArrowRight, Loader2, Play, Trash2 } from 'lucide-react';
import { PipelineStep, Segment } from '@/lib/types';
import { usePipelineSSE } from '@/lib/hooks/usePipelineSSE';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';

function formatDuration(s: number | null) {
  if (!s) return '—';
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
}

const STATUS_LABEL: Record<string, string> = {
  uploading: 'Uploading to Sia...',
  uploaded: 'Upload complete',
  transcribing: 'Transcribing audio',
  detecting: 'Detecting highlights',
  extracting: 'Extracting clips',
  rendering: 'Rendering 9:16',
  storing: 'Saving to Sia',
  complete: 'Complete',
  failed: 'Failed',
};

interface JobData {
  id: string;
  status: string;
  sourceFilename: string;
  sourceSiaObjectId: string | null;
  durationSeconds: number | null;
  siaHash: string | null;
  siaStatus: string;
  createdAt: string | null;
  updatedAt: string | null;
  pipelineSteps: PipelineStep[];
  segments: Segment[];
  transcript: { id: string; wordCount: number; createdAt: string | null } | null;
  siaLogs: { id: string; step: string; passed: boolean | null; message: string; ts: string | null }[];
}

export default function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [jobData, setJobData] = useState<JobData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);

  const fetchJobStatus = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/jobs/${id}`);
      if (!res.ok) {
        if (res.status === 404) {
          setError('Job not found');
          setLoading(false);
          return null;
        }
        throw new Error(`Failed to fetch job: ${res.status}`);
      }
      const data: JobData = await res.json();
      setJobData(data);
      setLoading(false);
      setError(null);
      return data;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to load job';
      setJobData((prev) => {
        if (!prev) {
          setError(message);
          setLoading(false);
        }
        return prev;
      });
      return null;
    }
  }, [id]);

  // Initial fetch
  useEffect(() => {
    fetchJobStatus();
  }, [fetchJobStatus]);

  // ── Real-time SSE updates (replaces polling) ──────────────────────────
  // When SSE is active, pipeline steps update instantly as the backend
  // processes each stage. Falls back to polling if SSE fails.
  const [sseFailed, setSseFailed] = useState(false);

  const handleStepUpdate = useCallback((step: { stage: string; status: string; progressPct: number; message: string }) => {
    setJobData((prev) => {
      if (!prev) return prev;
      const steps = prev.pipelineSteps.map((s) =>
        s.stage === step.stage
          ? { ...s, status: step.status as PipelineStep['status'], progressPct: step.progressPct, message: step.message }
          : s
      );
      // If step doesn't exist yet, add it
      if (!steps.find((s) => s.stage === step.stage)) {
        steps.push({
          id: '',
          jobId: prev.id,
          stage: step.stage as PipelineStep['stage'],
          status: step.status as PipelineStep['status'],
          progressPct: step.progressPct,
          message: step.message,
          startedAt: null,
          completedAt: null,
        });
      }
      return { ...prev, pipelineSteps: steps };
    });
  }, []);

  const handleJobStatus = useCallback((status: string, message: string) => {
    setJobData((prev) => {
      if (!prev) return prev;
      return { ...prev, status };
    });
  }, []);

  const handlePipelineComplete = useCallback(() => {
    // Refresh full job data to get segments, logs, etc.
    fetchJobStatus();
  }, [fetchJobStatus]);

  const handleSseError = useCallback((_error: string) => {
    setSseFailed(true);
  }, []);

  usePipelineSSE({
    jobId: jobData?.id,
    onStepUpdate: handleStepUpdate,
    onJobStatus: handleJobStatus,
    onPipelineComplete: handlePipelineComplete,
    onError: handleSseError,
    enabled: !!jobData && !['complete', 'failed'].includes(jobData.status),
  });

  // ── Polling fallback (only if SSE fails) ──────────────────────────────
  useEffect(() => {
    if (!jobData || !sseFailed) return;

    const terminalStatuses = ['complete', 'failed'];
    if (terminalStatuses.includes(jobData.status)) return;

    const interval = setInterval(() => {
      fetchJobStatus().then((data) => {
        if (data && terminalStatuses.includes(data.status)) {
          clearInterval(interval);
        }
      }).catch(() => {});
    }, 5000);

    return () => clearInterval(interval);
  }, [jobData?.id, jobData?.status, fetchJobStatus, sseFailed]);

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <Loader2 size={24} className="animate-spin mx-auto" style={{ color: 'var(--accent-bright)' }} />
        <p className="mt-3 text-sm" style={{ color: 'var(--text-muted)' }}>Loading job...</p>
      </div>
    );
  }

  if (error || !jobData) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p style={{ color: 'var(--text-muted)' }}>{error || 'Job not found.'}</p>
        <Link href="/projects" className="mt-3 inline-block text-sm" style={{ color: 'var(--accent-bright)' }}>← Back to projects</Link>
      </div>
    );
  }

  const handleDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/jobs/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to delete job');
      }
      router.push('/projects');
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to delete job';
      setError(message);
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  // Defensive dedup by stage. The backend now enforces a UNIQUE (job_id, stage)
  // constraint so duplicate rows shouldn't occur anymore, but this keeps the
  // UI safe even against stale data from before that migration ran.
  const steps = (jobData.pipelineSteps ?? []).filter(
    (step, index, arr) => arr.findIndex((s) => s.stage === step.stage) === index
  );
  const isComplete = jobData.status === 'complete';
  const isFailed = jobData.status === 'failed';
  const segmentCount = jobData.segments?.length ?? 0;

  // Determine if the pipeline is stuck and can be resumed
  const isRunning = steps.some((s) => s.status === 'running');
  const canResume = !isComplete && !isRunning && !['uploading'].includes(jobData.status);

  // Find the first non-complete stage to resume from
  const firstIncompleteStage = steps.find((s) => s.status !== 'complete')?.stage ?? undefined;

  const handleResume = async () => {
    if (resuming) return;
    setResuming(true);
    setResumeError(null);
    try {
      const params = firstIncompleteStage ? `?start_from=${firstIncompleteStage}` : '';
      const res = await fetch(`/api/jobs/${id}/start-pipeline${params}`);
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.detail || 'Failed to resume pipeline');
      }
      if (data?.status === 'already_running') {
        // The backend's lock rejected this — a pipeline task for this job
        // is already in flight. Not an error, just nothing new to do.
        setResumeError('Pipeline is already running for this job — give it a moment.');
      }
      // Refresh job data after a short delay so the backend has time to update
      setTimeout(() => fetchJobStatus(), 1000);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to resume pipeline';
      setResumeError(message);
    } finally {
      // Keep the button disabled for a few seconds no matter the outcome.
      // Previously this only reset on error, so a fast successful response
      // left the door open for an immediate second click before the
      // backend's state had actually changed.
      setTimeout(() => setResuming(false), 5000);
    }
  };

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
              {STATUS_LABEL[jobData.status] || jobData.status}
            </h1>
            <p className="text-sm mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>{jobData.sourceFilename}</p>
          </div>

          <PipelineTracker steps={steps} jobId={jobData.id} onRetry={() => fetchJobStatus()} />

          {/* Error state */}
          {isFailed && (
            <div className="px-4 py-3 rounded-lg text-sm"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: 'var(--danger)' }}>
              Pipeline failed. Check the logs for details.
            </div>
          )}

          {/* Complete state — link to clips */}
          {isComplete && segmentCount > 0 && (
            <Link href={`/projects/${jobData.id}/clips`}
              className="flex items-center justify-between gap-3 px-5 py-4 rounded-xl transition-all hover:scale-[1.01]"
              style={{ background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.3)' }}>
              <div className="min-w-0">
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Review clips</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {segmentCount} clips ready to approve or reject
                </p>
              </div>
              <ArrowRight size={16} className="shrink-0" style={{ color: 'var(--accent-bright)' }} />
            </Link>
          )}

          {/* Sia logs */}
          {jobData.siaLogs && jobData.siaLogs.length > 0 && (
            <div className="rounded-xl p-4" style={{ border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
              <h3 className="text-xs uppercase mb-2" style={{ color: 'var(--text-muted)', fontFamily: 'var(--mono)', letterSpacing: '0.08em', fontSize: '10px' }}>
                Sia Logs
              </h3>
              <div className="space-y-1.5">
                {jobData.siaLogs.map((log) => (
                  <div key={log.id} className="flex items-start gap-2 text-xs">
                    <span style={{
                      color: log.passed === true ? 'var(--success)' : log.passed === false ? 'var(--danger)' : 'var(--text-muted)',
                      fontFamily: 'var(--mono)',
                    }}>
                      {log.passed === true ? '✓' : log.passed === false ? '✗' : '·'}
                    </span>
                    <span style={{ color: 'var(--text-secondary)' }}>{log.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-3 order-1 md:order-2">
          <div className="rounded-xl p-4 space-y-3" style={{ border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
            <h2 className="text-xs uppercase" style={{ color: 'var(--text-muted)', fontFamily: 'var(--mono)', letterSpacing: '0.08em', fontSize: '10px' }}>
              Source Video
            </h2>
            <div className="space-y-2 text-xs" style={{ fontFamily: 'var(--mono)' }}>
              {[
                { label: 'File', value: jobData.sourceFilename },
                { label: 'Duration', value: formatDuration(jobData.durationSeconds) },
                { label: 'Job ID', value: jobData.id },
                { label: 'Sia ID', value: jobData.sourceSiaObjectId ?? 'not stored' },
                { label: 'Status', value: STATUS_LABEL[jobData.status] || jobData.status },
              ].map(({ label, value }) => (
                <div key={label}>
                  <span style={{ color: 'var(--text-muted)' }}>{label}</span>
                  <p className="truncate mt-0.5" style={{ color: 'var(--text-secondary)' }}>{value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Pipeline summary */}
          {steps.length > 0 && (
            <div className="rounded-xl p-4 space-y-2" style={{ border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
              <h2 className="text-xs uppercase" style={{ color: 'var(--text-muted)', fontFamily: 'var(--mono)', letterSpacing: '0.08em', fontSize: '10px' }}>
                Pipeline
              </h2>
              {steps.map((step) => (
                <div key={step.stage} className="flex items-center justify-between text-xs">
                  <span style={{ color: 'var(--text-secondary)' }}>{step.stage}</span>
                  <span style={{
                    color: step.status === 'complete' ? 'var(--success)' :
                           step.status === 'running' ? 'var(--accent-bright)' :
                           step.status === 'failed' ? 'var(--danger)' : 'var(--text-muted)',
                  }}>
                    {step.status === 'running' ? `${step.progressPct}%` : step.status}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Resume pipeline button — shown when pipeline is stuck */}
          {canResume && !showDeleteConfirm && (
            <button
              onClick={handleResume}
              disabled={resuming}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all"
              style={{
                background: 'rgba(124,58,237,0.1)',
                border: '1px solid rgba(124,58,237,0.3)',
                color: 'var(--accent-bright)',
              }}>
              {resuming ? (
                <><Loader2 size={14} className="animate-spin" /> Resuming...</>
              ) : (
                <><Play size={14} /> Resume pipeline</>
              )}
            </button>
          )}

          {resumeError && (
            <p className="text-xs text-center" style={{ color: 'var(--danger)' }}>{resumeError}</p>
          )}

          {/* Delete button */}
          {!showDeleteConfirm ? (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              disabled={deleting}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all"
              style={{
                background: 'rgba(239,68,68,0.08)',
                border: '1px solid rgba(239,68,68,0.2)',
                color: 'var(--danger)',
              }}>
              <Trash2 size={14} />
              Delete project
            </button>
          ) : (
            <div
              className="rounded-xl p-4 space-y-3"
              style={{ border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.06)' }}>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                Are you sure you want to delete <strong>{jobData.sourceFilename}</strong>? This action cannot be undone.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all"
                  style={{ background: 'var(--danger)', color: 'white' }}>
                  {deleting ? <><Loader2 size={12} className="animate-spin" /> Deleting...</> : 'Delete'}
                </button>
                <button
                  onClick={() => { setShowDeleteConfirm(false); setError(null); }}
                  disabled={deleting}
                  className="flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all"
                  style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}