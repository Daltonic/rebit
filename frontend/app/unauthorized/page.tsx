import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';

export default function UnauthorizedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm text-center">
        <div className="flex justify-center mb-6">
          <div
            className="w-16 h-16 rounded-xl flex items-center justify-center"
            style={{
              background: 'rgba(239,68,68,0.15)',
              border: '1px solid rgba(239,68,68,0.2)',
            }}
          >
            <ShieldAlert size={32} style={{ color: 'var(--danger)' }} />
          </div>
        </div>

        <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
          Access Denied
        </h1>

        <p className="text-sm mb-8" style={{ color: 'var(--text-secondary)' }}>
          You don't have the required permissions to access this page.
          If you believe this is a mistake, contact your administrator.
        </p>

        <div className="flex flex-col gap-3">
          <Link
            href="/projects"
            className="w-full py-2.5 rounded-lg font-medium text-sm transition-all"
            style={{
              background: 'var(--accent)',
              color: 'white',
            }}
          >
            Go to Projects
          </Link>
          <Link
            href="/login"
            className="w-full py-2.5 rounded-lg font-medium text-sm transition-all"
            style={{
              background: 'var(--bg-elevated)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border)',
            }}
          >
            Sign in as different user
          </Link>
        </div>
      </div>
    </div>
  );
}