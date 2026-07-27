'use client';
import { use, useState, useEffect } from 'react';
import Link from 'next/link';
import ClipCard from '@/components/ClipCard';
import { ArrowLeft, Download, Loader2 } from 'lucide-react';
import { Segment, SegmentStatus } from '@/lib/types';


type SortBy = 'virality' | 'time';

interface JobData {
  id: string;
  status: string;
  sourceFilename: string;
  sourceSiaObjectId: string | null;
  segments: Segment[];
}

export default function ClipsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [jobData, setJobData] = useState<JobData | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<SegmentStatus | 'all'>('all');
  const [sortBy, setSortBy] = useState<SortBy>('virality');

  useEffect(() => {
    const fetchJob = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/jobs/${id}`);
        if (!res.ok) {
          if (res.status === 404) {
            setError('Job not found');
            return;
          }
          throw new Error(`Failed to fetch job: ${res.status}`);
        }
        const data: JobData = await res.json();
        setJobData(data);
        setSegments(data.segments || []);
        setError(null);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to load clips');
      } finally {
        setLoading(false);
      }
    };
    fetchJob();
  }, [id]);

  // Poll for new segments if job is still processing
  useEffect(() => {
    if (!jobData) return;
    if (['complete', 'failed'].includes(jobData.status)) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/jobs/${id}`);
        if (res.ok) {
          const data: JobData = await res.json();
          setJobData(data);
          if (data.segments) setSegments(data.segments);
        }
      } catch {
        // ignore polling errors
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [id, jobData?.status]);

  const handleApprove = (segId: string) =>
    setSegments(prev => prev.map(s => s.id === segId ? { ...s, status: 'approved' } : s));
  const handleReject = (segId: string) =>
    setSegments(prev => prev.map(s => s.id === segId ? { ...s, status: 'rejected' } : s));

  const filtered = segments
    .filter(s => statusFilter === 'all' || s.status === statusFilter)
    .sort((a, b) => sortBy === 'virality' ? b.viralityScore - a.viralityScore : a.startSeconds - b.startSeconds);

  const approved = segments.filter(s => s.status === 'approved').length;
  const pending = segments.filter(s => s.status === 'pending').length;

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-16 text-center">
        <Loader2 size={24} className="animate-spin mx-auto" style={{ color: 'var(--accent-bright)' }} />
        <p className="mt-3 text-sm" style={{ color: 'var(--text-muted)' }}>Loading clips...</p>
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

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 sm:py-8">
      {/* Back */}
      <Link href={`/projects/${id}`} className="inline-flex items-center gap-1.5 text-sm mb-6"
        style={{ color: 'var(--text-muted)' }}>
        <ArrowLeft size={13} /> Pipeline
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)', letterSpacing: '-0.025em' }}>
            Clip Review
          </h1>
          <p className="text-sm mt-0.5 truncate max-w-xs" style={{ color: 'var(--text-muted)' }}>
            {jobData.sourceFilename}
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap w-full sm:w-auto">
          {/* Stats */}
          <div className="flex items-center gap-4 px-4 py-2 rounded-lg text-sm flex-1 sm:flex-initial justify-center sm:justify-start"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <span><span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{approved}</span>
              <span style={{ color: 'var(--text-muted)' }}> approved</span></span>
            <span><span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{pending}</span>
              <span style={{ color: 'var(--text-muted)' }}> pending</span></span>
          </div>

          {approved > 0 && (
            <button className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium flex-1 sm:flex-initial"
              style={{ background: 'var(--accent)', color: 'white', boxShadow: '0 0 16px var(--accent-glow)' }}
              onClick={() => {
                // Trigger downloads of all approved clips from Sia
                const approvedSegments = segments.filter(s => s.status === 'approved');
                approvedSegments.forEach((seg, i) => {
                  setTimeout(() => {
                    const a = document.createElement('a');
                    a.href = `/api/jobs/${id}/clips/${seg.id}/download`;
                    a.download = `clip-${seg.id}.mp4`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                  }, i * 500); // stagger 500ms apart to avoid browser download throttling
                });
              }}>
              <Download size={13} /> Export {approved} clip{approved !== 1 ? 's' : ''}
            </button>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        {/* Filter */}
        <div className="flex items-center gap-1 p-1 rounded-lg overflow-x-auto" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          {(['all', 'pending', 'approved', 'rejected'] as const).map(v => (
            <button key={v} onClick={() => setStatusFilter(v)}
              className="px-3 py-1.5 sm:py-1 rounded text-xs capitalize transition-all flex-shrink-0 whitespace-nowrap"
              style={{
                background: statusFilter === v ? 'var(--bg-elevated)' : 'transparent',
                color: statusFilter === v ? 'var(--text-primary)' : 'var(--text-muted)',
              }}>
              {v}
            </button>
          ))}
        </div>

        {/* Sort */}
        <div className="flex items-center gap-1 p-1 rounded-lg overflow-x-auto" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          {(['virality', 'time'] as SortBy[]).map(v => (
            <button key={v} onClick={() => setSortBy(v)}
              className="px-3 py-1.5 sm:py-1 rounded text-xs transition-all capitalize flex-shrink-0 whitespace-nowrap"
              style={{
                background: sortBy === v ? 'var(--bg-elevated)' : 'transparent',
                color: sortBy === v ? 'var(--text-primary)' : 'var(--text-muted)',
              }}>
              {v === 'virality' ? 'By score' : 'By time'}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 px-4 rounded-xl" style={{ border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {segments.length === 0
              ? 'No clips have been generated yet. The pipeline may still be processing.'
              : 'No clips match this filter.'}
          </p>
          {segments.length === 0 && (
            <Link href={`/projects/${id}`} className="mt-3 inline-block text-sm" style={{ color: 'var(--accent-bright)' }}>
              ← Back to pipeline
            </Link>
          )}
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map(seg => (
            <ClipCard
              key={seg.id}
              segment={seg}
              sourceUrl={`/api/jobs/${id}/clips/${seg.id}`}
              jobId={id}
              onApprove={handleApprove}
              onReject={handleReject}
            />
          ))}
        </div>
      )}
    </div>
  );
}