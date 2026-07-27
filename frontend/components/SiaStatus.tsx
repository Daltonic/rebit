'use client';

import { useState, useEffect } from 'react';
import { Wifi, WifiOff, Loader2 } from 'lucide-react';

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

    // Refresh periodically, but only when the page is visible.
    // Sia connection status rarely changes mid-session, so there's
    // no need to hammer the backend when the tab is backgrounded.
    function handleVisibility() {
      if (document.visibilityState === 'visible') {
        fetchStatus();
      }
    }
    document.addEventListener('visibilitychange', handleVisibility);

    // Poll every 60 seconds as a fallback (only when visible anyway
    // due to the visibility guard inside fetchStatus — but this
    // ensures eventual freshness).
    const interval = setInterval(fetchStatus, 60_000);
    return () => {
      mounted = false;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
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