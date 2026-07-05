'use client';

import { useState, useEffect } from 'react';
import { Server, Wifi, WifiOff, Loader2 } from 'lucide-react';

interface SiaStatusData {
  connected: boolean;
  mode: 'live' | 'demo';
  reason: string | null;
  indexerUrl: string | null;
}

export default function SiaStatus() {
  const [status, setStatus] = useState<SiaStatusData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function fetchStatus() {
      try {
        const res = await fetch('/api/sia/status');
        if (res.ok) {
          const data: SiaStatusData = await res.json();
          if (mounted) setStatus(data);
        }
      } catch {
        // Ignore fetch errors
      } finally {
        if (mounted) setLoading(false);
      }
    }

    fetchStatus();

    // Poll every 30 seconds
    const interval = setInterval(fetchStatus, 30_000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs" style={{ opacity: 0.5 }}>
        <Loader2 size={12} className="animate-spin" />
        <span style={{ fontFamily: 'var(--mono)' }}>Sia: checking...</span>
      </div>
    );
  }

  if (!status || status.mode === 'demo') {
    return (
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
        style={{
          background: 'rgba(245,158,11,0.08)',
          border: '1px solid rgba(245,158,11,0.2)',
          color: 'var(--warning)',
        }}
      >
        <WifiOff size={12} />
        <span style={{ fontFamily: 'var(--mono)' }}>
          Sia: {status?.reason ? `demo — ${status.reason}` : 'demo mode'}
        </span>
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
      style={{
        background: 'rgba(16,185,129,0.08)',
        border: '1px solid rgba(16,185,129,0.2)',
        color: 'var(--success)',
      }}
    >
      <Wifi size={12} />
      <span style={{ fontFamily: 'var(--mono)' }}>Sia: live</span>
    </div>
  );
}