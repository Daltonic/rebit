'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { Upload, LayoutGrid, Zap, LogOut, Settings } from 'lucide-react';
import { useState } from 'react';

const NAV_ITEMS = [
  { href: '/upload', label: 'Upload', icon: Upload },
  { href: '/projects', label: 'Projects', icon: LayoutGrid },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [collapsed, setCollapsed] = useState(false);
  const isPublicPage = pathname === '/' || pathname === '/login';
  if (isPublicPage) return null;

  return (
    <>
      {/* Sidebar */}
      <aside
        className="fixed left-0 top-0 bottom-0 z-50 flex flex-col border-r transition-all duration-200"
        style={{
          width: collapsed ? '60px' : '220px',
          background: 'rgba(10,10,15,0.95)',
          backdropFilter: 'blur(12px)',
          borderColor: 'var(--border)',
        }}
      >
        {/* Logo */}
        <div className="flex items-center gap-2 px-4 h-14 border-b" style={{ borderColor: 'var(--border)' }}>
          <Link href="/projects" className="flex items-center gap-2 min-w-0">
            <div
              className="w-7 h-7 rounded flex items-center justify-center flex-shrink-0"
              style={{ background: 'var(--accent)', boxShadow: '0 0 12px var(--accent-glow)' }}
            >
              <Zap size={14} color="white" fill="white" />
            </div>
            {!collapsed && (
              <span
                style={{
                  fontFamily: 'var(--mono)',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  letterSpacing: '-0.02em',
                  fontSize: '0.95rem',
                }}
              >
                re<span style={{ color: 'var(--accent-bright)' }}>bit</span>
              </span>
            )}
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + '/');
            return (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all"
                style={{
                  color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                  background: active ? 'var(--bg-elevated)' : 'transparent',
                }}
                title={collapsed ? label : undefined}
              >
                <Icon size={16} className="flex-shrink-0" />
                {!collapsed && <span>{label}</span>}
              </Link>
            );
          })}

        </nav>

        {/* Bottom section */}
        <div className="px-2 py-3 border-t space-y-2" style={{ borderColor: 'var(--border)' }}>
          {/* User info */}
          {session?.user && (
            <div className="flex items-center gap-3 px-3 py-2">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0"
                style={{ background: 'var(--accent)', color: 'white' }}
              >
                {session.user.name?.[0]?.toUpperCase() || 'U'}
              </div>
              {!collapsed && (
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                    {session.user.name || 'User'}
                  </p>
                  <p className="text-xs truncate" style={{ color: 'var(--text-muted)', fontFamily: 'var(--mono)', fontSize: '0.65rem' }}>
                    {session.user.email || ''}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Sign out */}
          <button
            onClick={() => signOut({ callbackUrl: '/' })}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs transition-all"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--danger)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; }}
          >
            <LogOut size={14} />
            {!collapsed && <span>Sign out</span>}
          </button>

          {/* Collapse toggle */}
          <button
            onClick={() => setCollapsed(c => !c)}
            className="w-full flex items-center justify-center py-1 rounded text-xs"
            style={{ color: 'var(--text-muted)' }}
          >
            {collapsed ? '→' : '←'}
          </button>
        </div>
      </aside>

      {/* Main content offset */}
      <div style={{ marginLeft: collapsed ? '60px' : '220px', transition: 'margin-left 0.2s' }} />
    </>
  );
}