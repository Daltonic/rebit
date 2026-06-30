'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Plus, Search, Filter } from 'lucide-react';
import { mockJobs } from '@/lib/mock/data';
import ProjectCard from '@/components/ProjectCard';
import SiaStatus from '@/components/SiaStatus';
import { JobStatus } from '@/lib/types';

const FILTERS: { label: string; value: JobStatus | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Processing', value: 'transcribing' },
  { label: 'Complete', value: 'complete' },
  { label: 'Failed', value: 'failed' },
];

export default function ProjectsPage() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<JobStatus | 'all'>('all');

  const jobs = mockJobs.filter(j => {
    const matchSearch = j.sourceFilename.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === 'all' || j.status === filter ||
      (filter === 'transcribing' && !['complete', 'failed'].includes(j.status));
    return matchSearch && matchFilter;
  });

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 sm:py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)', letterSpacing: '-0.025em' }}>Projects</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {mockJobs.length} video{mockJobs.length !== 1 ? 's' : ''} processed
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <SiaStatus connected={false} demoMode={true} />
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
              className="px-3 py-1.5 sm:py-1 rounded text-xs transition-all flex-shrink-0 whitespace-nowrap"
              style={{
                background: filter === f.value ? 'var(--bg-elevated)' : 'transparent',
                color: filter === f.value ? 'var(--text-primary)' : 'var(--text-muted)',
              }}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Job list */}
      {jobs.length === 0 ? (
        <div className="text-center py-16 px-4 rounded-xl" style={{ border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No projects match your search.</p>
          <Link href="/upload" className="mt-3 inline-flex items-center gap-1.5 text-sm"
            style={{ color: 'var(--accent-bright)' }}>
            <Plus size={13} /> Upload a video
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map(job => <ProjectCard key={job.id} job={job} />)}
        </div>
      )}
    </div>
  );
}
