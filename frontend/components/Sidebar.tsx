'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Upload, LayoutGrid, Zap, Settings, X } from 'lucide-react';
import { useEffect } from 'react';
import { useSidebar } from './SidebarContext';

const NAV_ITEMS = [
  { href: '/upload', label: 'Upload', icon: Upload },
  { href: '/projects', label: 'Projects', icon: LayoutGrid },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { collapsed, setCollapsed, mobileOpen, setMobileOpen } = useSidebar();
  const isPublicPage = pathname === '/' || pathname === '/login';

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname, setMobileOpen]);

  // Prevent body scroll while the mobile drawer is open.
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [mobileOpen]);

  if (isPublicPage) return null;

  return (
    <>
      {/* Backdrop — mobile/tablet only, shown while drawer is open */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 md:hidden"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)' }}
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex flex-col border-r transition-transform duration-200 ease-in-out
          w-62.5 ${collapsed ? 'md:w-15' : 'md:w-55'}
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}
        style={{
          background: 'rgba(10,10,15,0.98)',
          backdropFilter: 'blur(12px)',
          borderColor: 'var(--border)',
        }}
      >
        {/* Logo */}
        <div className="flex items-center justify-between gap-2 px-4 h-14 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
          <Link href="/projects" className="flex items-center gap-2 min-w-0">
            <div
              className="w-7 h-7 rounded flex items-center justify-center shrink-0"
              style={{ background: 'var(--accent)', boxShadow: '0 0 12px var(--accent-glow)' }}
            >
              <Zap size={14} color="white" fill="white" />
            </div>
            <span
              className={collapsed ? 'md:hidden' : ''}
              style={{
                fontFamily: 'var(--mono)',
                fontWeight: 600,
                color: 'var(--text-primary)',
                letterSpacing: '-0.02em',
                fontSize: '0.95rem',
                whiteSpace: 'nowrap',
              }}
            >
              re<span style={{ color: 'var(--accent-bright)' }}>bit</span>
            </span>
          </Link>

          {/* Close button — mobile only */}
          <button
            onClick={() => setMobileOpen(false)}
            className="md:hidden p-1.5 rounded-lg shrink-0"
            style={{ color: 'var(--text-muted)' }}
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + '/');
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-3 px-3 py-2.5 md:py-2 rounded-lg text-sm transition-all"
                style={{
                  color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                  background: active ? 'var(--bg-elevated)' : 'transparent',
                }}
                title={collapsed && !mobileOpen ? label : undefined}
              >
                <Icon size={16} className="shrink-0" />
                <span className={collapsed ? 'md:hidden' : ''}>{label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Bottom section — collapse toggle, desktop only */}
        <div className="px-2 py-3 border-t space-y-2 shrink-0" style={{ borderColor: 'var(--border)' }}>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden md:flex w-full items-center justify-center py-1 rounded text-xs cursor-pointer"
            style={{ color: 'var(--text-muted)' }}
          >
            {collapsed ? '→' : '←'}
          </button>
        </div>
      </aside>
    </>
  );
}
