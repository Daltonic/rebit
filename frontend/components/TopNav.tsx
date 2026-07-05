'use client';

import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import Image from 'next/image';
import { LogOut, Menu } from 'lucide-react';
import { useSidebar } from './SidebarContext';
import SiaStatus from './SiaStatus';

export default function TopNav() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { collapsed, setMobileOpen } = useSidebar();
  const isPublicPage = pathname === '/' || pathname === '/login' || pathname === '/setup' || pathname === '/unauthorized';
  if (isPublicPage) return null;

  return (
    <header
      className={`fixed top-0 right-0 left-0 z-30 flex items-center justify-between md:justify-end gap-3 px-4 md:px-6 h-14 border-b transition-[left] duration-200 ${collapsed ? 'md:left-15' : 'md:left-55'
        }`}
      style={{
        background: 'rgba(10,10,15,0.95)',
        backdropFilter: 'blur(12px)',
        borderColor: 'var(--border)',
      }}
    >
      {/* Hamburger — mobile/tablet only */}
      <button
        onClick={() => setMobileOpen(true)}
        className="md:hidden p-2 rounded-lg"
        style={{ color: 'var(--text-secondary)' }}
        aria-label="Open menu"
      >
        <Menu size={20} />
      </button>

      <div className="flex-1" />

      <div className="flex items-center gap-3">
        <SiaStatus />

        {session?.user && (
          <div className="flex items-center gap-2 md:gap-3">
            {session.user.image ? (
              <Image
                src={session.user.image}
                alt={session.user.name || 'User'}
                width={28}
                height={28}
                className="w-7 h-7 rounded-full object-cover"
                unoptimized
              />
            ) : (
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0"
                style={{ background: 'var(--accent)', color: 'white' }}
              >
                {session.user.name?.[0]?.toUpperCase() || 'U'}
              </div>
            )}
            <span className="text-sm font-medium hidden sm:inline" style={{ color: 'var(--text-primary)' }}>
              {session.user.name || 'User'}
            </span>
            <button
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer"
              style={{ color: 'var(--text-muted)' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--danger)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; }}
              aria-label="Sign out"
            >
              <LogOut size={14} />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
}