'use client';

import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { LogOut } from 'lucide-react';

export default function TopNav() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const isPublicPage = pathname === '/' || pathname === '/login';
  if (isPublicPage) return null;

  return (
    <header
      className="fixed top-0 right-0 z-40 flex items-center justify-end gap-3 px-6 h-14 border-b"
      style={{
        left: '220px',
        background: 'rgba(10,10,15,0.95)',
        backdropFilter: 'blur(12px)',
        borderColor: 'var(--border)',
      }}
    >
      {session?.user && (
        <div className="flex items-center gap-3">
          {session.user.image ? (
            <img
              src={session.user.image}
              alt={session.user.name || 'User'}
              className="w-7 h-7 rounded-full object-cover"
            />
          ) : (
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold"
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
          >
            <LogOut size={14} />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      )}
    </header>
  );
}