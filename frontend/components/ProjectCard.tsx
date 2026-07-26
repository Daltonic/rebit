'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Job, JobStatus } from '@/lib/types';
import { ArrowRight, RotateCcw, Clock, CheckCircle2, XCircle, Loader2, Play, Film, Trash2 } from 'lucide-react';

function statusConfig(s: JobStatus) {
  const configs = {
    uploading: { label: 'Uploading', color: 'var(--info)', bg: 'rgba(59,130,246,0.1)', icon: Loader2, spin: true },
    uploaded: { label: 'Uploaded', color: 'var(--info)', bg: 'rgba(59,130,246,0.1)', icon: Loader2, spin: true },
    transcribing: { label: 'Transcribing', color: 'var(--info)', bg: 'rgba(59,130,246,0.1)', icon: Loader2, spin: true },
    detecting: { label: 'Detecting', color: 'var(--accent-bright)', bg: 'rgba(139,92,246,0.1)', icon: Loader2, spin: true },
    extracting: { label: 'Extracting', color: 'var(--accent-bright)', bg: 'rgba(139,92,246,0.1)', icon: Loader2, spin: true },
    rendering: { label: 'Rendering', color: 'var(--warning)', bg: 'rgba(245,158,11,0.1)', icon: Loader2, spin: true },
    storing: { label: 'Storing', color: 'var(--warning)', bg: 'rgba(245,158,11,0.1)', icon: Loader2, spin: true },
    complete: { label: 'Complete', color: 'var(--success)', bg: 'rgba(16,185,129,0.1)', icon: CheckCircle2, spin: false },
    failed: { label: 'Failed', color: 'var(--danger)', bg: 'rgba(239,68,68,0.1)', icon: XCircle, spin: false },
  };
  return configs[s] ?? configs.uploading;
}

function formatDuration(s: number | null) {
  if (!s) return null;
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${Math.floor(s % 60)}s`;
  return `${Math.floor(s)}s`;
}

// Uploaded files are frequently saved under a generated id (screen
// recordings, mobile exports, the job's own storage key, etc.) rather
// than anything a person typed — "329e5862b0c6.mp4" tells a viewer
// nothing. Detect that pattern and show a friendlier title instead,
// while keeping the real filename available as a tooltip.
const HASH_LIKE_STEM = /^[a-f0-9]{6,40}$/i;

function isHashLikeFilename(filename: string): boolean {
  const stem = filename.replace(/\.[^./]+$/, '');
  return HASH_LIKE_STEM.test(stem);
}

function formatShortDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(iso));
  } catch {
    return '';
  }
}

function displayTitle(job: Job): string {
  return isHashLikeFilename(job.sourceFilename)
    ? `Video from ${formatShortDate(job.createdAt)}`
    : job.sourceFilename;
}

// A single cohesive hue per project (not random unrelated colors), used
// to tint a small fanned stack of "clip" rectangles. This hints at what's
// actually inside — several vertical short-form clips — instead of one
// flat banner that has nothing to do with the content.
function hashStr(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

function paletteForId(id: string) {
  const hue = hashStr(id) % 360;
  return {
    front: `linear-gradient(155deg, hsl(${hue} 72% 46%) 0%, hsl(${(hue + 30) % 360} 70% 32%) 100%)`,
    mid: `hsl(${hue} 45% 26%)`,
    back: `hsl(${hue} 40% 17%)`,
  };
}

/** Small fanned stack of vertical rectangles standing in for the project's clips. */
function ClipStackThumbnail({ job }: { job: Job }) {
  const palette = paletteForId(job.id);
  const clipCount = job._count?.segments;

  return (
    <div className="relative shrink-0" style={{ width: 76, height: 108 }}>
      <div className="absolute inset-0 rounded-lg" style={{
        background: palette.back,
        transform: 'rotate(-9deg) translate(-3px, 3px)',
      }} />
      <div className="absolute inset-0 rounded-lg" style={{
        background: palette.mid,
        transform: 'rotate(6deg) translate(3px, 1px)',
      }} />
      <div className="absolute inset-0 rounded-lg flex items-center justify-center overflow-hidden"
        style={{ background: palette.front, border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 6px 16px rgba(0,0,0,0.35)' }}>
        <div style={{
          width: 26, height: 26, borderRadius: '50%',
          background: 'rgba(0,0,0,0.3)',
          border: '1px solid rgba(255,255,255,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Play size={11} fill="white" style={{ color: 'white', marginLeft: 1 }} />
        </div>

        {clipCount !== undefined && (
          <div className="absolute bottom-1 right-1 flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px]"
            style={{ background: 'rgba(0,0,0,0.5)', color: 'white', fontFamily: 'var(--mono)' }}>
            <Film size={9} />{clipCount}
          </div>
        )}
      </div>
    </div>
  );
}

function TimeAgo({ iso }: { iso: string }) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const update = () => setNow(Date.now());
    update();
    const id = setInterval(update, 30_000);
    return () => clearInterval(id);
  }, []);

  // During SSR and first client render, now is null.
  // Using iso's timestamp as the fallback ensures both sides compute the same
  // diff (0 → "just now"), avoiding hydration mismatches.
  const diff = (now ?? new Date(iso).getTime()) - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return <>just now</>;
  if (m < 60) return <>{m}m ago</>;
  const h = Math.floor(m / 60);
  if (h < 24) return <>{h}h ago</>;
  return <>{Math.floor(h / 24)}d ago</>;
}

interface ProjectCardProps {
  job: Job;
  /** Called after the project has been deleted on the backend, so the parent list can drop it. */
  onDeleted?: (jobId: string) => void;
}

export default function ProjectCard({ job, onDeleted }: ProjectCardProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const cfg = statusConfig(job.status);
  const Icon = cfg.icon;
  const isProcessing = !['complete', 'failed'].includes(job.status);
  const href = job.status === 'complete'
    ? `/projects/${job.id}/clips`
    : `/projects/${job.id}`;
  const duration = formatDuration(job.durationSeconds);
  const clipCount = job._count?.segments;

  const openConfirm = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDeleteError(null);
    setConfirmOpen(true);
  };

  const cancelDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setConfirmOpen(false);
  };

  const confirmDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/jobs/${job.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
      onDeleted?.(job.id);
    } catch {
      setDeleting(false);
      setDeleteError("Couldn't delete this project. Try again.");
    }
  };

  return (
    <Link
      href={href}
      className="relative flex items-start gap-3 sm:gap-4 group rounded-xl p-3 sm:p-4 transition-all duration-200 active:scale-[0.99] sm:hover:scale-[1.005]"
      style={{ border: '1px solid var(--border)', background: 'var(--bg-card)' }}
    >
      <ClipStackThumbnail job={job} />

      {/* Main content */}
      <div className="flex-1 min-w-0 pt-0.5">
        <h3 className="text-sm font-medium truncate" title={job.sourceFilename} style={{ color: 'var(--text-primary)' }}>
          {displayTitle(job)}
        </h3>

        {/* Compact meta row: status pill + duration + clip count + time ago */}
        <div className="mt-1.5 flex items-center flex-wrap gap-x-2.5 gap-y-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded"
            style={{ background: cfg.bg, border: `1px solid ${cfg.color}25` }}>
            <Icon size={9} style={{ color: cfg.color }} className={cfg.spin ? 'animate-spin' : ''} />
            <span style={{ color: cfg.color, fontFamily: 'var(--mono)' }}>{cfg.label}</span>
          </span>

          {duration && <span style={{ fontFamily: 'var(--mono)' }}>{duration}</span>}

          {clipCount !== undefined && (
            <span>{clipCount} clip{clipCount !== 1 ? 's' : ''}</span>
          )}

          <span className="inline-flex items-center gap-1">
            <Clock size={10} />
            <TimeAgo iso={job.createdAt} />
          </span>
        </div>

        {/* Active pipeline progress bar */}
        {isProcessing && (() => {
          const running = job.pipelineSteps?.find(s => s.status === 'running');
          const completed = job.pipelineSteps?.filter(s => s.status === 'complete').length ?? 0;
          const total = job.pipelineSteps?.length ?? 6;
          const pct = running?.progressPct
            ? ((completed + running.progressPct / 100) / total) * 100
            : (completed / total) * 100;
          return (
            <div className="mt-2.5 score-bar">
              <div className="score-bar-fill" style={{ width: `${pct}%` }} />
            </div>
          );
        })()}

        {job.status === 'failed' && (
          <div className="mt-2 flex items-center gap-1.5 text-xs cursor-pointer hover:opacity-80 py-1"
            style={{ color: 'var(--danger)' }}
            onClick={e => { e.preventDefault(); e.stopPropagation(); alert('Retry not yet wired to API'); }}>
            <RotateCcw size={11} /> Retry job
          </div>
        )}
      </div>

      {/* Right rail: delete + arrow, always visible so deleting never requires opening the project */}
      <div className="flex flex-col items-center gap-2 shrink-0">
        <div
          role="button"
          tabIndex={0}
          aria-label={`Delete ${job.sourceFilename}`}
          onClick={openConfirm}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') openConfirm(e); }}
          className="w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer transition-colors hover:bg-[rgba(239,68,68,0.12)]"
          style={{ color: 'var(--text-muted)' }}
        >
          <Trash2 size={14} style={{ opacity: 0.75 }} />
        </div>
        <ArrowRight size={14} style={{ color: 'var(--text-muted)' }}
          className="hidden sm:block transition-transform group-hover:translate-x-1" />
      </div>

      {/* Delete confirmation overlay */}
      {confirmOpen && (
        <div
          onClick={e => { e.preventDefault(); e.stopPropagation(); }}
          className="absolute inset-0 rounded-xl flex flex-col items-center justify-center gap-3 px-5 text-center"
          style={{ background: 'rgba(10,10,14,0.94)', backdropFilter: 'blur(2px)', zIndex: 20 }}
        >
          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            Delete this project?
          </p>
          <p className="text-xs max-w-[85%]" style={{ color: 'var(--text-muted)' }}>
            {displayTitle(job)} and its clips will be removed. This can&apos;t be undone.
          </p>
          {deleteError && (
            <p className="text-xs" style={{ color: 'var(--danger)' }}>{deleteError}</p>
          )}
          <div className="flex items-center gap-2 mt-1">
            <button
              onClick={cancelDelete}
              disabled={deleting}
              className="px-3 py-1.5 rounded-lg text-xs font-medium"
              style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
            >
              Cancel
            </button>
            <button
              onClick={confirmDelete}
              disabled={deleting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
              style={{ background: 'rgba(239,68,68,0.15)', color: 'var(--danger)', border: '1px solid rgba(239,68,68,0.3)' }}
            >
              {deleting
                ? <Loader2 size={12} className="animate-spin" />
                : <Trash2 size={12} />
              }
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </div>
      )}
    </Link>
  );
}