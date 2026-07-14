'use client';
import { useState } from 'react';
import { PipelineStep, StageStatus } from '@/lib/types';
import { Check, X, Loader2, Clock, Mic, Brain, Scissors, Film, Database, Upload, RefreshCw } from 'lucide-react';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';

const STAGES: { key: PipelineStep['stage']; label: string; icon: React.ElementType }[] = [
  { key: 'sia_upload', label: 'Sia Upload', icon: Upload },
  { key: 'transcribe', label: 'Transcribe', icon: Mic },
  { key: 'detect', label: 'Detect Highlights', icon: Brain },
  { key: 'extract', label: 'Extract Clips', icon: Scissors },
  { key: 'render', label: 'Render 9:16', icon: Film },
  { key: 'sia_store', label: 'Store on Sia', icon: Database },
];

function StatusIcon({ status }: { status: StageStatus }) {
  if (status === 'complete') return <Check size={12} style={{ color: 'var(--success)' }} />;
  if (status === 'failed') return <X size={12} style={{ color: 'var(--danger)' }} />;
  if (status === 'running') return <Loader2 size={12} className="animate-spin" style={{ color: 'var(--accent-bright)' }} />;
  return <Clock size={12} style={{ color: 'var(--text-muted)' }} />;
}

function statusColor(s: StageStatus) {
  if (s === 'complete') return 'var(--success)';
  if (s === 'failed') return 'var(--danger)';
  if (s === 'running') return 'var(--accent-bright)';
  return 'var(--text-muted)';
}

function elapsed(start: string | null, end: string | null) {
  if (!start) return null;
  const ms = (end ? new Date(end) : new Date()).getTime() - new Date(start).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

export default function PipelineTracker({ steps, jobId, onRetry }: { steps: PipelineStep[]; jobId?: string; onRetry?: (stage: string) => void }) {
  const stepMap = Object.fromEntries(steps.map(s => [s.stage, s]));
  const [retryingStage, setRetryingStage] = useState<string | null>(null);

  const handleRetry = async (stage: string) => {
    if (!jobId) return;
    setRetryingStage(stage);
    try {
      const res = await fetch(`${BACKEND_URL}/api/jobs/${jobId}/start-pipeline?start_from=${stage}`);
      if (!res.ok) throw new Error('Failed to retry');
      if (onRetry) onRetry(stage);
    } catch (e) {
      console.error('Retry failed:', e);
    } finally {
      setRetryingStage(null);
    }
  };

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
      <div className="px-4 sm:px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
        <h2 className="text-sm font-semibold" style={{ fontFamily: 'var(--mono)', color: 'var(--text-secondary)', letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: '11px' }}>
          Pipeline Progress
        </h2>
      </div>

      <div className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
        {STAGES.map(({ key, label, icon: Icon }, idx) => {
          const step = stepMap[key];
          const status: StageStatus = step?.status ?? 'pending';
          const color = statusColor(status);
          const isRetrying = retryingStage === key;

          return (
            <div key={key} className="px-4 sm:px-5 py-3.5 sm:py-4 flex items-start gap-3 sm:gap-4">
              {/* Connector line + dot */}
              <div className="flex flex-col items-center mt-0.5 flex-shrink-0" style={{ width: 24 }}>
                <div className="w-6 h-6 rounded-full flex items-center justify-center border"
                  style={{
                    borderColor: status === 'pending' ? 'var(--border)' : color,
                    background: status === 'pending' ? 'transparent' : `${color}15`,
                  }}>
                  {isRetrying ? (
                    <Loader2 size={11} className="animate-spin" style={{ color: 'var(--accent-bright)' }} />
                  ) : (
                    <Icon size={11} style={{ color: status === 'pending' ? 'var(--text-muted)' : color }} />
                  )}
                </div>
                {idx < STAGES.length - 1 && (
                  <div className="w-px flex-1 mt-1" style={{ minHeight: 16, background: status === 'complete' ? 'var(--success)' : 'var(--border)' }} />
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium" style={{ color: status === 'pending' ? 'var(--text-muted)' : 'var(--text-primary)' }}>
                    {label}
                  </span>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {step && (
                      <span className="text-xs" style={{ fontFamily: 'var(--mono)', color: 'var(--text-muted)' }}>
                        {elapsed(step.startedAt, step.completedAt)}
                      </span>
                    )}
                    <div className="w-4 h-4 flex items-center justify-center">
                      <StatusIcon status={isRetrying ? 'running' : status} />
                    </div>
                  </div>
                </div>

                {step?.message && (
                  <p className="text-xs mt-0.5" style={{ color: status === 'failed' ? 'var(--danger)' : 'var(--text-secondary)', fontFamily: status === 'failed' ? 'var(--mono)' : 'var(--sans)' }}>
                    {step.message}
                  </p>
                )}

                {status === 'running' && step?.progressPct > 0 && (
                  <div className="mt-2 score-bar">
                    <div className="score-bar-fill" style={{ width: `${step.progressPct}%` }} />
                  </div>
                )}

                {/* Retry button for failed steps */}
                {status === 'failed' && jobId && (
                  <button
                    onClick={() => handleRetry(key)}
                    disabled={isRetrying}
                    className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:scale-[1.02]"
                    style={{
                      background: 'rgba(124,58,237,0.1)',
                      border: '1px solid rgba(124,58,237,0.25)',
                      color: 'var(--accent-bright)',
                      opacity: isRetrying ? 0.6 : 1,
                    }}>
                    {isRetrying ? (
                      <><Loader2 size={11} className="animate-spin" /> Retrying...</>
                    ) : (
                      <><RefreshCw size={11} /> Retry from here</>
                    )}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}