'use client';
import { use, useState } from 'react';
import Link from 'next/link';
import { mockJobs } from '@/lib/mock/data';
import ClipCard from '@/components/ClipCard';
import { ArrowLeft, Download } from 'lucide-react';
import { Segment, SegmentStatus } from '@/lib/types';

type SortBy = 'virality' | 'time';

export default function ClipsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const job = mockJobs.find(j => j.id === id);
  const [segments, setSegments] = useState<Segment[]>(job?.segments ?? []);
  const [statusFilter, setStatusFilter] = useState<SegmentStatus | 'all'>('all');
  const [sortBy, setSortBy] = useState<SortBy>('virality');

  if (!job) return (
    <div className="max-w-2xl mx-auto px-4 py-16 text-center">
      <p style={{ color: 'var(--text-muted)' }}>Job not found.</p>
      <Link href="/projects" className="mt-3 inline-block text-sm" style={{ color: 'var(--accent-bright)' }}>← Back to projects</Link>
    </div>
  );

  const handleApprove = (segId: string) => setSegments(prev => prev.map(s => s.id === segId ? { ...s, status: 'approved' } : s));
  const handleReject = (segId: string) => setSegments(prev => prev.map(s => s.id === segId ? { ...s, status: 'rejected' } : s));

  const filtered = segments
    .filter(s => statusFilter === 'all' || s.status === statusFilter)
    .sort((a, b) => sortBy === 'virality' ? b.viralityScore - a.viralityScore : a.startSeconds - b.startSeconds);

  const approved = segments.filter(s => s.status === 'approved').length;
  const pending = segments.filter(s => s.status === 'pending').length;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Back */}
      <Link href={`/projects/${id}`} className="inline-flex items-center gap-1.5 text-sm mb-6"
        style={{ color: 'var(--text-muted)' }}>
        <ArrowLeft size={13} /> Pipeline
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)', letterSpacing: '-0.025em' }}>
            Clip Review
          </h1>
          <p className="text-sm mt-0.5 truncate max-w-xs" style={{ color: 'var(--text-muted)' }}>
            {job.sourceFilename}
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Stats */}
          <div className="flex items-center gap-4 px-4 py-2 rounded-lg text-sm"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <span><span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{approved}</span>
              <span style={{ color: 'var(--text-muted)' }}> approved</span></span>
            <span><span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{pending}</span>
              <span style={{ color: 'var(--text-muted)' }}> pending</span></span>
          </div>

          {approved > 0 && (
            <button className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium"
              style={{ background: 'var(--accent)', color: 'white', boxShadow: '0 0 16px var(--accent-glow)' }}
              onClick={() => alert(`Exporting ${approved} clip${approved !== 1 ? 's' : ''}…`)}>
              <Download size={13} /> Export {approved} clip{approved !== 1 ? 's' : ''}
            </button>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        {/* Filter */}
        <div className="flex items-center gap-1 p-1 rounded-lg" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          {(['all', 'pending', 'approved', 'rejected'] as const).map(v => (
            <button key={v} onClick={() => setStatusFilter(v)}
              className="px-3 py-1 rounded text-xs capitalize transition-all"
              style={{
                background: statusFilter === v ? 'var(--bg-elevated)' : 'transparent',
                color: statusFilter === v ? 'var(--text-primary)' : 'var(--text-muted)',
              }}>
              {v}
            </button>
          ))}
        </div>

        {/* Sort */}
        <div className="flex items-center gap-1 p-1 rounded-lg" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          {(['virality', 'time'] as SortBy[]).map(v => (
            <button key={v} onClick={() => setSortBy(v)}
              className="px-3 py-1 rounded text-xs transition-all capitalize"
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
        <div className="text-center py-16 rounded-xl" style={{ border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No clips match this filter.</p>
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map(seg => (
            <ClipCard key={seg.id} segment={seg} sourceUrl={job.sourceUrl} onApprove={handleApprove} onReject={handleReject} />
          ))}
        </div>
      )}
    </div>
  );
}
