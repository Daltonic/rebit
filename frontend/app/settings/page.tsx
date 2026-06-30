'use client';

import { useState, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { startRegistration } from '@simplewebauthn/browser';
import { Fingerprint, Shield, AlertCircle, Loader2, CheckCircle2, Smartphone, Trash2 } from 'lucide-react';

export default function SettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [passkeyAvailable, setPasskeyAvailable] = useState<boolean | null>(null);
  const [enrolling, setEnrolling] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [enrolled, setEnrolled] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const statusFetched = useRef(false);

  useEffect(() => {
    const available = typeof window !== 'undefined' &&
      window.PublicKeyCredential !== undefined;
    setPasskeyAvailable(available);
  }, []);

  // Check enrollment status once on mount
  useEffect(() => {
    if (statusFetched.current) return;
    statusFetched.current = true;
    fetch('/api/auth/passkey/status')
      .then((res) => res.json())
      .then((data) => setEnrolled(Boolean(data.enrolled)))
      .catch(() => {});
  }, []);

  // Redirect if not logged in — wait for session to resolve first
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  async function handleEnroll() {
    if (!passkeyAvailable) {
      setMessage({ type: 'error', text: 'Passkeys are not supported on this device/browser.' });
      return;
    }

    setEnrolling(true);
    setMessage(null);

    try {
      const beginRes = await fetch('/api/auth/passkey/register/begin');
      if (!beginRes.ok) {
        const data = await beginRes.json();
        throw new Error(data.error || 'Failed to start registration.');
      }

      const options = await beginRes.json();
      const regResponse = await startRegistration(options);

      const completeRes = await fetch('/api/auth/passkey/register/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(regResponse),
      });

      if (!completeRes.ok) {
        const data = await completeRes.json();
        throw new Error(data.error || 'Registration verification failed.');
      }

      setEnrolled(true);
      setMessage({ type: 'success', text: 'Passkey enrolled successfully! You can now sign in with your fingerprint.' });
    } catch (err: any) {
      if (err.name === 'AbortError' || err.name === 'NotAllowedError') {
        setMessage({ type: 'error', text: 'Passkey registration was cancelled.' });
      } else {
        setMessage({ type: 'error', text: err.message || 'Enrollment failed.' });
      }
    } finally {
      setEnrolling(false);
    }
  }

  async function handleRemove() {
    setRemoving(true);
    setMessage(null);

    try {
      const res = await fetch('/api/auth/passkey/delete', {
        method: 'DELETE',
      });

      const data = await res.json();

      if (res.ok) {
        setEnrolled(false);
        setMessage({ type: 'success', text: data.message || 'Passkey removed.' });
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to remove passkey.' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error. Please try again.' });
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 sm:py-8">
      <h1 className="text-xl font-semibold mb-1" style={{ color: 'var(--text-primary)', letterSpacing: '-0.025em' }}>
        Settings
      </h1>
      <p className="text-sm mb-6 sm:mb-8" style={{ color: 'var(--text-muted)' }}>
        Manage your account and device settings.
      </p>

      {/* Passkey Enrollment Card */}
      <div
        className="rounded-2xl p-4 sm:p-6"
        style={{ border: '1px solid var(--border)', background: 'var(--bg-card)' }}
      >
        <div className="flex items-start sm:items-center gap-3 mb-6">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(124,58,237,0.1)', color: 'var(--accent-bright)' }}
          >
            <Fingerprint size={20} />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              Passkey (Biometric Authentication)
            </h2>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Enroll this device for password-free sign in with fingerprint, Face ID, or Windows Hello
            </p>
          </div>
        </div>

        {/* Device info */}
        <div
          className="flex items-center gap-3 px-4 py-3 rounded-lg mb-4 text-sm"
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
        >
          <Smartphone size={16} className="flex-shrink-0" style={{ color: 'var(--text-secondary)' }} />
          <div className="min-w-0">
            <p className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
              {typeof navigator !== 'undefined' ? navigator.platform || 'Unknown device' : 'Unknown device'}
            </p>
            <p className="text-xs truncate" style={{ color: 'var(--text-muted)', fontFamily: 'var(--mono)', fontSize: '0.65rem' }}>
              {session?.user?.email || ''}
            </p>
          </div>
        </div>

        {/* Passkey status */}
        <div
          className="flex items-center gap-3 px-4 py-3 rounded-lg mb-4 text-sm"
          style={{
            background: passkeyAvailable
              ? 'rgba(16,185,129,0.1)'
              : 'rgba(239,68,68,0.1)',
            border: `1px solid ${
              passkeyAvailable
                ? 'rgba(16,185,129,0.2)'
                : 'rgba(239,68,68,0.2)'
            }`,
          }}
        >
          {passkeyAvailable ? (
            <Shield size={16} className="flex-shrink-0" style={{ color: 'var(--success)' }} />
          ) : (
            <AlertCircle size={16} className="flex-shrink-0" style={{ color: 'var(--danger)' }} />
          )}
          <span
            className="text-xs"
            style={{
              color: passkeyAvailable ? 'var(--success)' : 'var(--danger)',
            }}
          >
            {passkeyAvailable
              ? 'Passkey ready — uses your device biometrics'
              : 'Passkey not supported on this browser'}
          </span>
          {enrolled && <CheckCircle2 size={14} className="flex-shrink-0" style={{ color: 'var(--success)', marginLeft: 'auto' }} />}
        </div>

        {/* Enroll / Remove button */}
        {enrolled ? (
          <button
            onClick={handleRemove}
            disabled={removing}
            className="w-full flex items-center justify-center gap-2 py-3 sm:py-2.5 rounded-lg text-sm font-semibold transition-all disabled:opacity-50"
            style={{
              background: 'rgba(239,68,68,0.1)',
              color: 'var(--danger)',
              border: '1px solid rgba(239,68,68,0.2)',
            }}
          >
            {removing ? (
              <><Loader2 size={14} className="animate-spin" /> Removing passkey…</>
            ) : (
              <><Trash2 size={14} /> Remove passkey</>
            )}
          </button>
        ) : (
          <button
            onClick={handleEnroll}
            disabled={enrolling || !passkeyAvailable}
            className="w-full flex items-center justify-center gap-2 py-3 sm:py-2.5 rounded-lg text-sm font-semibold transition-all disabled:opacity-50"
            style={{
              background: passkeyAvailable ? 'var(--accent)' : 'var(--bg-elevated)',
              color: passkeyAvailable ? 'white' : 'var(--text-muted)',
              boxShadow: passkeyAvailable ? '0 0 16px var(--accent-glow)' : 'none',
            }}
          >
            {enrolling ? (
              <><Loader2 size={14} className="animate-spin" /> Opening biometric dialogue…</>
            ) : (
              <><Fingerprint size={14} /> Enroll this device</>
            )}
          </button>
        )}

        {/* Message */}
        {message && (
          <div
            className="flex items-start gap-2 px-4 py-2.5 rounded-lg text-sm mt-4"
            style={{
              background: message.type === 'success'
                ? 'rgba(16,185,129,0.1)'
                : 'rgba(239,68,68,0.1)',
              border: `1px solid ${message.type === 'success'
                  ? 'rgba(16,185,129,0.2)'
                  : 'rgba(239,68,68,0.2)'
                }`,
              color: message.type === 'success' ? 'var(--success)' : 'var(--danger)',
            }}
          >
            {message.type === 'success' ? <CheckCircle2 size={14} className="flex-shrink-0 mt-0.5" /> : <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />}
            {message.text}
          </div>
        )}

        <p className="text-xs mt-4 text-center" style={{ color: 'var(--text-muted)' }}>
          {enrolled
            ? 'This device can sign in with just your fingerprint, Face ID, or Windows Hello.'
            : 'After enrolling, you can sign in with just your device biometrics — no email or password needed.'}
        </p>
      </div>
    </div>
  );
}
