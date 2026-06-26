'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Upload, LayoutGrid, Zap } from 'lucide-react';

const DEMO_MODE = true; // replace with real Sia status check

export default function NavBar() {
  const pathname = usePathname();

  const links = [
    { href: '/upload', label: 'Upload', icon: Upload },
    { href: '/projects', label: 'Projects', icon: LayoutGrid },
  ];

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-14 border-b"
      style={{ background: 'rgba(10,10,15,0.85)', backdropFilter: 'blur(12px)', borderColor: 'var(--border)' }}>
      <div className="max-w-6xl mx-auto px-4 h-full flex items-center justify-between">
        <Link href="/projects" className="flex items-center gap-2 group">
          <div className="w-7 h-7 rounded flex items-center justify-center"
            style={{ background: 'var(--accent)', boxShadow: '0 0 12px var(--accent-glow)' }}>
            <Zap size={14} color="white" fill="white" />
          </div>
          <span style={{ fontFamily: 'var(--mono)', fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            re<span style={{ color: 'var(--accent-bright)' }}>bit</span>
          </span>
        </Link>

        <nav className="flex items-center gap-1">
          {links.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <Link key={href} href={href}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition-all"
                style={{
                  color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                  background: active ? 'var(--bg-elevated)' : 'transparent',
                  fontFamily: 'var(--sans)',
                }}>
                <Icon size={14} />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          {DEMO_MODE && (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs"
              style={{ background: 'rgba(245,158,11,0.1)', color: 'var(--warning)', border: '1px solid rgba(245,158,11,0.2)', fontFamily: 'var(--mono)' }}>
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
              demo mode
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
