'use client';

import { useState, useEffect } from 'react';
import { signIn, useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { startAuthentication } from '@simplewebauthn/browser';
import { Zap, Shield, AlertCircle, Loader2, Fingerprint } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState<string | null>(null);
  const [passkeyAvailable, setPasskeyAvailable] = useState<boolean | null>(null);
  const [checkingPasskey, setCheckingPasskey] = useState(true);

  useEffect(() => {
    const available = typeof window !== 'undefined' &&
      window.PublicKeyCredential !== undefined;
    setPasskeyAvailable(available);
    setCheckingPasskey(false);
  }, []);

  // If already logged in, redirect to projects
  useEffect(() => {
    if (session?.user) {
      router.push('/projects');
    }
  }, [session, router]);

  async function handleSocialLogin(provider: 'google' | 'github') {
    setLoading(provider);
    setError('');
    await signIn(provider, { callbackUrl: '/projects' });
  }

  async function handlePasskeyLogin() {
    if (!passkeyAvailable) {
      setError('Passkeys are not supported on this device/browser.');
      return;
    }

    setLoading('passkey');
    setError('');

    try {
      // Step 1: Get authentication options from server
      const beginRes = await fetch('/api/auth/passkey/auth/begin');
      if (!beginRes.ok) {
        const data = await beginRes.json();
        throw new Error(data.error || 'Failed to start authentication.');
      }

      const { options } = await beginRes.json();

      // Step 2: Trigger the native biometric dialogue
      const authResponse = await startAuthentication(options);

      // Step 3: Send the response back to the server for verification
      const completeRes = await fetch('/api/auth/passkey/auth/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response: authResponse }),
      });

      if (!completeRes.ok) {
        const data = await completeRes.json();
        throw new Error(data.error || 'Passkey verification failed.');
      }

      // Redirect on success (session cookie is set server-side)
      router.push('/projects');
    } catch (err: any) {
      // Don't show error for user cancellation
      if (err.name === 'NotAllowedError') {
        setLoading(null);
        return;
      }
      setError(err.message || 'Passkey sign-in failed. Please try again.');
      setLoading(null);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-4">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{
                background: 'var(--accent)',
                boxShadow: '0 0 20px var(--accent-glow)',
              }}
            >
              <Zap size={20} color="white" fill="white" />
            </div>
            <span
              style={{
                fontFamily: 'var(--mono)',
                fontWeight: 700,
                fontSize: '1.5rem',
                color: 'var(--text-primary)',
              }}
            >
              re<span style={{ color: 'var(--accent-bright)' }}>bit</span>
            </span>
          </div>
          <h1 className="text-lg font-medium" style={{ color: 'var(--text-secondary)' }}>
            Sign in to your account
          </h1>
        </div>

        {/* Passkey availability indicator */}
        <div
          className="flex items-center gap-3 px-4 py-3 rounded-lg mb-6 text-sm"
          style={{
            background: passkeyAvailable
              ? 'rgba(16,185,129,0.1)'
              : checkingPasskey
                ? 'rgba(59,130,246,0.1)'
                : 'rgba(239,68,68,0.1)',
            border: `1px solid ${
              passkeyAvailable
                ? 'rgba(16,185,129,0.2)'
                : checkingPasskey
                  ? 'rgba(59,130,246,0.2)'
                  : 'rgba(239,68,68,0.2)'
            }`,
          }}
        >
          {checkingPasskey ? (
            <Loader2 size={18} className="animate-spin" style={{ color: 'var(--info)' }} />
          ) : passkeyAvailable ? (
            <Shield size={18} style={{ color: 'var(--success)' }} />
          ) : (
            <AlertCircle size={18} style={{ color: 'var(--danger)' }} />
          )}
          <span
            style={{
              color:
                passkeyAvailable
                  ? 'var(--success)'
                  : checkingPasskey
                    ? 'var(--info)'
                    : 'var(--danger)',
            }}
          >
            {checkingPasskey
              ? 'Checking passkey support...'
              : passkeyAvailable
                ? 'Passkey ready — uses your device biometrics'
                : 'Passkey not supported on this browser'}
          </span>
        </div>

        {/* Passkey Login */}
        <div className="space-y-3 mb-6">
          <button
            onClick={handlePasskeyLogin}
            disabled={loading !== null || !passkeyAvailable}
            className="w-full flex items-center justify-center gap-3 py-3 rounded-lg font-medium text-sm transition-all disabled:opacity-50"
            style={{
              background: passkeyAvailable ? 'var(--accent)' : 'var(--bg-elevated)',
              color: passkeyAvailable ? 'white' : 'var(--text-muted)',
              border: '1px solid var(--border)',
              boxShadow: passkeyAvailable ? '0 0 16px var(--accent-glow)' : 'none',
            }}
          >
            {loading === 'passkey' ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Fingerprint size={18} />
            )}
            {loading === 'passkey' ? 'Authenticating...' : 'Sign in with passkey'}
          </button>

        </div>

        {/* Divider */}
        <div className="flex items-center gap-3 mb-6">
          <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>or continue with</span>
          <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
        </div>

        {/* Social Login Buttons */}
        <div className="space-y-3">
          <button
            onClick={() => handleSocialLogin('google')}
            disabled={loading !== null}
            className="w-full flex items-center justify-center gap-3 py-2.5 rounded-lg font-medium text-sm transition-all disabled:opacity-50"
            style={{
              background: 'var(--bg-elevated)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border)',
            }}
          >
            {loading === 'google' ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
            )}
            {loading === 'google' ? 'Signing in...' : 'Continue with Google'}
          </button>

          <button
            onClick={() => handleSocialLogin('github')}
            disabled={loading !== null}
            className="w-full flex items-center justify-center gap-3 py-2.5 rounded-lg font-medium text-sm transition-all disabled:opacity-50"
            style={{
              background: 'var(--bg-elevated)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border)',
            }}
          >
            {loading === 'github' ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
            )}
            {loading === 'github' ? 'Signing in...' : 'Continue with GitHub'}
          </button>
        </div>

        {error && (
          <div
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm mt-4"
            style={{
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.2)',
              color: 'var(--danger)',
            }}
          >
            <AlertCircle size={14} />
            {error}
          </div>
        )}

        <p
          className="text-center mt-6 text-xs"
          style={{ color: 'var(--text-muted)' }}
        >
          Secured with WebAuthn — your biometrics never leave your device
        </p>
      </div>
    </div>
  );
}