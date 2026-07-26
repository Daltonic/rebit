'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Plus, Search, Loader2 } from 'lucide-react';
import { useSession } from 'next-auth/react';
import ProjectCard from '@/components/ProjectCard';
import { JobStatus, PipelineStep, SiaUploadStatus } from '@/lib/types';

const FILTERS: { label: string; value: JobStatus | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Processing', value: 'transcribing' },
  { label: 'Complete', value: 'complete' },
  { label: 'Failed', value: 'failed' },
];

interface JobListItem {
  id: string;
  status: JobStatus;
  sourceFilename: string;
  sourceSiaObjectId: string | null;
  durationSeconds: number | null;
  siaHash: string | null;
  siaStatus: string;
  createdAt: string;
  updatedAt: string;
  pipelineSteps: PipelineStep[];
  segmentCount: number;
}

export default function ProjectsPage() {
  const { data: session } = useSession();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<JobStatus | 'all'>('all');
  const [jobs, setJobs] = useState<JobListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchJobs = async () => {
      try {
        setLoading(true);
        const userId = session?.user?.id;
        const params = userId ? `?user_id=${encodeURIComponent(userId)}` : '';
        const res = await fetch(`/api/jobs${params}`);
        if (!res.ok) throw new Error(`Failed to fetch jobs: ${res.status}`);
        const data: JobListItem[] = await res.json();
        setJobs(data);
        setError(null);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to load projects');
      } finally {
        setLoading(false);
      }
    };

    fetchJobs();
    // Poll for updates every 10 seconds
    const interval = setInterval(fetchJobs, 10000);
    return () => clearInterval(interval);
  }, [session?.user?.id]);

  const filtered = jobs.filter(j => {
    const matchSearch = j.sourceFilename.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === 'all' || j.status === filter ||
      (filter === 'transcribing' && !['complete', 'failed'].includes(j.status));
    return matchSearch && matchFilter;
  });

  const handleDeleted = (jobId: string) => {
    setJobs(prev => prev.filter(j => j.id !== jobId));
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 sm:py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)', letterSpacing: '-0.025em' }}>Projects</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {loading ? 'Loading...' : `${jobs.length} video${jobs.length !== 1 ? 's' : ''} processed`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link href="/upload"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all"
            style={{ background: 'var(--accent)', color: 'white', boxShadow: '0 0 16px var(--accent-glow)' }}>
            <Plus size={14} /> New upload
          </Link>
        </div>
      </div>

      {/* Search + filter */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="flex-1 relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by filename…"
            className="w-full pl-8 pr-3 py-2.5 sm:py-2 rounded-lg text-sm outline-none transition-colors"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
          />
        </div>
        <div
          className="flex items-center gap-1 p-1 rounded-lg overflow-x-auto"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
        >
          {FILTERS.map(f => (
            <button key={f.value} onClick={() => setFilter(f.value)}
              className="px-3 py-1.5 sm:py-1 rounded text-xs transition-all shrink-0 whitespace-nowrap"
              style={{
                background: filter === f.value ? 'var(--bg-elevated)' : 'transparent',
                color: filter === f.value ? 'var(--text-primary)' : 'var(--text-muted)',
              }}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Loading state */}
      {loading && jobs.length === 0 && (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={20} className="animate-spin" style={{ color: 'var(--accent-bright)' }} />
        </div>
      )}

      {/* Error state */}
      {error && jobs.length === 0 && (
        <div className="text-center py-16 px-4 rounded-xl" style={{ border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{error}</p>
          <Link href="/upload" className="mt-3 inline-flex items-center gap-1.5 text-sm"
            style={{ color: 'var(--accent-bright)' }}>
            <Plus size={13} /> Upload a video
          </Link>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && filtered.length === 0 && (
        <div className="text-center py-16 px-4 rounded-xl" style={{ border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {jobs.length === 0 ? 'No projects yet.' : 'No projects match your search.'}
          </p>
          <Link href="/upload" className="mt-3 inline-flex items-center gap-1.5 text-sm"
            style={{ color: 'var(--accent-bright)' }}>
            <Plus size={13} /> Upload a video
          </Link>
        </div>
      )}

      {/* Job list */}
      {filtered.length > 0 && (
        <div className="space-y-3">
          {filtered.map(job => (
            <ProjectCard key={job.id} job={{
              id: job.id,
              status: job.status,
              sourceFilename: job.sourceFilename,
              sourceSiaObjectId: job.sourceSiaObjectId,
              durationSeconds: job.durationSeconds,
              siaHash: job.siaHash,
              indexdKey: null,
              siaStatus: job.siaStatus as SiaUploadStatus,
              createdAt: job.createdAt,
              updatedAt: job.updatedAt,
              pipelineSteps: job.pipelineSteps,
              _count: { segments: job.segmentCount },
            }} onDeleted={handleDeleted} />
          ))}
        </div>
      )}
    </div>
  );
}