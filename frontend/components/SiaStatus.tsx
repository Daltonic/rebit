'use client';
import { Server, Wifi, WifiOff } from 'lucide-react';

interface Props {
  connected: boolean;
  demoMode: boolean;
}

export default function SiaStatus({ connected, demoMode }: Props) {
  if (demoMode) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
        style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', color: 'var(--warning)' }}>
        <WifiOff size={12} />
        <span style={{ fontFamily: 'var(--mono)' }}>Sia: demo mode — uploads simulated</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
      style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', color: 'var(--success)' }}>
      <Wifi size={12} />
      <span style={{ fontFamily: 'var(--mono)' }}>Sia: live</span>
    </div>
  );
}
