'use client';

import { useState, useEffect, useRef, useSyncExternalStore } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { startRegistration } from '@simplewebauthn/browser';
import {
  Fingerprint,
  Shield,
  AlertCircle,
  Loader2,
  CheckCircle2,
  Smartphone,
  Trash2,
  Server,
  Globe,
  GitFork,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  ExternalLink,
  Eye,
  EyeOff,
  Cookie,
  Upload,
} from 'lucide-react';
import type { SiaRegistrationResponse, SiaCheckResponse } from '@/lib/types';

// ── Helper: Generate Random App ID ─────────────────────────────────────

function generateAppId(): string {
  const chars = '0123456789abcdef';
  let result = '';
  for (let i = 0; i < 64; i++) {
    result += chars[Math.floor(Math.random() * 16)];
  }
  return result;
}

// ── Collapsible Section ─────────────────────────────────────────────────

function CollapsibleSection({
  title,
  icon,
  defaultOpen = false,
  children,
}: {
  title: React.ReactNode;
  icon: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{ border: '1px solid var(--border)' }}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium transition-colors"
        style={{
          background: 'var(--bg-elevated)',
          color: 'var(--text-primary)',
        }}
      >
        <span className="flex items-center gap-2">
          {icon}
          {title}
        </span>
        {open ? (
          <ChevronUp size={14} style={{ color: 'var(--text-muted)' }} />
        ) : (
          <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} />
        )}
      </button>
      {open && <div className="p-4 space-y-4">{children}</div>}
    </div>
  );
}

export default function SettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  // Hydration-safe browser feature checks — useSyncExternalStore is the
  // React 18+ pattern that avoids hydration mismatches AND ESLint errors.
  // The subscribe() returns a no-op because these values never change.
  const passkeyAvailable = useSyncExternalStore(
    () => () => {},
    () => typeof window !== 'undefined' && window.PublicKeyCredential !== undefined,
    () => null
  );
  const devicePlatform = useSyncExternalStore(
    () => () => {},
    () => typeof navigator !== 'undefined' ? navigator.platform || 'Unknown device' : 'Unknown device',
    () => 'Unknown device'
  );
  const [enrolling, setEnrolling] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [enrolled, setEnrolled] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const statusFetched = useRef(false);

  // ── Services state ─────────────────────────────────────────────────

  // Loading
  const [servicesLoading, setServicesLoading] = useState(true);

  // Sia (mirrors the setup page flow)
  const [siaConnected, setSiaConnected] = useState(false);
  const [siaIndexerUrl, setSiaIndexerUrl] = useState('https://sia.storage');
  const [siaAppId, setSiaAppId] = useState('');
  const [siaAppName, setSiaAppName] = useState('ReBit');
  const [siaAppDescription, setSiaAppDescription] = useState('Decentralized video clipping engine');
  const [siaRecoveryPhrase, setSiaRecoveryPhrase] = useState('');
  const [siaLoading, setSiaLoading] = useState(false);
  const [siaError, setSiaError] = useState<string | null>(null);
  const [approvalUrl, setApprovalUrl] = useState<string | null>(null);
  const [checkingApproval, setCheckingApproval] = useState(false);

  // Google
  const [hasGoogle, setHasGoogle] = useState(false);
  const [googleClientId, setGoogleClientId] = useState('');
  const [googleClientSecret, setGoogleClientSecret] = useState('');
  const [showGoogleSecret, setShowGoogleSecret] = useState(false);

  // GitHub
  const [hasGitHub, setHasGitHub] = useState(false);
  const [githubClientId, setGithubClientId] = useState('');
  const [githubClientSecret, setGithubClientSecret] = useState('');
  const [showGithubSecret, setShowGithubSecret] = useState(false);

  // Providers saving
  const [provSaving, setProvSaving] = useState(false);
  const [provError, setProvError] = useState<string | null>(null);

  // ── Passkey ────────────────────────────────────────────────────────

  // Check enrollment status on mount
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

  // ── Load service configuration on mount ─────────────────────────────

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch('/api/setup/status');
        const data = await res.json();

        if (cancelled) return;

        if (data.siaConnected) {
          setSiaConnected(true);
          if (data.siaIndexerUrl) setSiaIndexerUrl(data.siaIndexerUrl);
          if (data.siaAppId) setSiaAppId(data.siaAppId);
          if (data.siaAppName) setSiaAppName(data.siaAppName);
          if (data.siaAppDescription) setSiaAppDescription(data.siaAppDescription);
        }

        setHasGoogle(data.hasGoogle);
        setHasGitHub(data.hasGitHub);

        setServicesLoading(false);
      } catch {
        if (!cancelled) {
          setServicesLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  // ── Passkey Handlers ───────────────────────────────────────────────

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
    } catch (err: unknown) {
      if (err instanceof DOMException && (err.name === 'AbortError' || err.name === 'NotAllowedError')) {
        setMessage({ type: 'error', text: 'Passkey registration was cancelled.' });
      } else {
        setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Enrollment failed.' });
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

  // ── Sia Handlers (full setup flow like the setup page) ─────────────

  async function handleSiaSubmit() {
    if (
      !siaIndexerUrl.trim() ||
      !siaAppId.trim() ||
      !siaAppName.trim() ||
      !siaRecoveryPhrase.trim()
    )
      return;
    setSiaLoading(true);
    setSiaError(null);
    setApprovalUrl(null);

    try {
      // Always pass reconnect: true from the settings page — the DB should
      // NOT be updated until approval is confirmed (test of authenticity).
      const res = await fetch('/api/setup/sia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siaIndexerUrl: siaIndexerUrl.trim(),
          siaAppId: siaAppId.trim(),
          siaAppName: siaAppName.trim(),
          siaAppDescription: siaAppDescription.trim(),
          recoveryPhrase: siaRecoveryPhrase.trim(),
          reconnect: true,
        }),
      });

      const data: SiaRegistrationResponse = await res.json();

      if (!data.ok) {
        if (data.already_connected) {
          setSiaConnected(true);
          setSiaError(null);
          return;
        }
        setSiaError(data.error || 'Registration failed');
        return;
      }

      // ok === true — show the approval URL so the user can authorize
      if (data.approval_url) {
        setApprovalUrl(data.approval_url);
      } else {
        // No approval URL means the backend didn't start a registration flow.
        // This shouldn't happen on a successful response, but handle gracefully.
        setSiaError(
          'Registration started but no approval URL was returned. Please try again.'
        );
      }
    } catch (err) {
      setSiaError(
        err instanceof Error ? err.message : 'Failed to contact server'
      );
    } finally {
      setSiaLoading(false);
    }
  }

  /**
   * Initiates a full re-connection flow: resets state and immediately
   * disconnects the current Sia session so the user can re-register.
   */
  async function handleSiaReconnect() {
    setSiaConnected(false);
    setApprovalUrl(null);
    setSiaError(null);
    setSiaRecoveryPhrase('');
    setSiaLoading(false);
  }

  async function handleCheckApproval() {
    setCheckingApproval(true);
    setSiaError(null);

    try {
      const res = await fetch('/api/setup/sia/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data: SiaCheckResponse = await res.json();

      if (data.ok && data.status === 'approved') {
        setSiaConnected(true);
        setApprovalUrl(null);
        setSiaRecoveryPhrase(''); // Clear from memory
      } else if (data.ok && data.status === 'pending') {
        setSiaError(
          'Still pending approval. Please approve the app on the Sia indexer and try again.'
        );
      } else {
        setSiaError(data.error || 'Failed to check approval status');
      }
    } catch (err) {
      setSiaError(
        err instanceof Error ? err.message : 'Failed to check approval'
      );
    } finally {
      setCheckingApproval(false);
    }
  }

  // ── YouTube Cookies Handlers ─────────────────────────────────────

  // YouTube cookies state
  const [hasYtCookies, setHasYtCookies] = useState(false);
  const [ytCookiesSize, setYtCookiesSize] = useState(0);
  const [ytCookiesUploading, setYtCookiesUploading] = useState(false);
  const [ytCookiesMsg, setYtCookiesMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Check YouTube cookies status on mount
  useEffect(() => {
    fetch('/api/url-import/cookies')
      .then((res) => res.json())
      .then((data) => {
        setHasYtCookies(data.hasCookies);
        setYtCookiesSize(data.cookieSize);
      })
      .catch(() => {});
  }, []);

  async function handleYtCookiesUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setYtCookiesUploading(true);
    setYtCookiesMsg(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/url-import/cookies', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (res.ok) {
        setHasYtCookies(true);
        setYtCookiesSize(data.size);
        setYtCookiesMsg({ type: 'success', text: data.message || 'Cookies uploaded successfully.' });
      } else {
        setYtCookiesMsg({ type: 'error', text: data.detail || 'Failed to upload cookies.' });
      }
    } catch (err) {
      setYtCookiesMsg({ type: 'error', text: err instanceof Error ? err.message : 'Network error.' });
    } finally {
      setYtCookiesUploading(false);
      // Reset the file input so the same file can be re-selected
      e.target.value = '';
    }
  }

  // ── Providers Handlers ────────────────────────────────────────────

  async function handleProvidersSave() {
    if (!googleClientId.trim() && !githubClientId.trim()) return;
    setProvSaving(true);
    setProvError(null);

    try {
      const res = await fetch('/api/setup/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          googleClientId: googleClientId.trim() || undefined,
          googleClientSecret: googleClientSecret.trim() || undefined,
          githubClientId: githubClientId.trim() || undefined,
          githubClientSecret: githubClientSecret.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setHasGoogle(!!googleClientId.trim());
        setHasGitHub(!!githubClientId.trim());
        setProvError(null);
      } else {
        setProvError(data.error || 'Failed to save providers.');
      }
    } catch (err) {
      setProvError(err instanceof Error ? err.message : 'Network error.');
    } finally {
      setProvSaving(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 sm:py-8 space-y-8">
      <div>
        <h1 className="text-xl font-semibold mb-1" style={{ color: 'var(--text-primary)', letterSpacing: '-0.025em' }}>
          Settings
        </h1>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Manage your account, device, and service connections.
        </p>
      </div>

      {/* ── Passkey Enrollment Card ─────────────────────────────────── */}
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
              {devicePlatform}
            </p>
            <p className="text-xs truncate" style={{ color: 'var(--text-muted)', fontFamily: 'var(--mono)', fontSize: '0.65rem' }}>
              {session?.user?.email || ''}
            </p>
          </div>
        </div>

        {/* Passkey status — passkeyAvailable is null during SSR, so we
            render a neutral placeholder to avoid hydration mismatches. */}
        {passkeyAvailable === null ? (
          <div
            className="flex items-center gap-3 px-4 py-3 rounded-lg mb-4 text-sm"
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
            }}
          >
            <Loader2 size={16} className="animate-spin flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Checking passkey support…
            </span>
          </div>
        ) : (
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
        )}

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
            disabled={enrolling || passkeyAvailable === null || !passkeyAvailable}
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

      {/* ── Services & Connections Card ─────────────────────────────── */}
      <div
        className="rounded-2xl p-4 sm:p-6"
        style={{ border: '1px solid var(--border)', background: 'var(--bg-card)' }}
      >
        <div className="flex items-start sm:items-center gap-3 mb-6">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(59,130,246,0.1)', color: 'var(--blue)' }}
          >
            <Server size={20} />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              Services & Connections
            </h2>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Manage platform services, API keys, and authentication providers
            </p>
          </div>
        </div>

        {servicesLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--subtle)' }} />
          </div>
        ) : (
          <div className="space-y-3">
            {/* ── Sia Storage (full flow like setup page) ─────────── */}
            <CollapsibleSection
              title={
                <span>
                  Sia Storage{' '}
                  <span
                    className="text-xs ml-1.5"
                    style={{ color: siaConnected ? 'var(--success)' : 'var(--danger)' }}
                  >
                    ({siaConnected ? 'Connected' : 'Disconnected'})
                  </span>
                </span>
              }
              icon={<Globe size={14} style={{ color: siaConnected ? 'var(--success)' : 'var(--text-muted)' }} />}
              defaultOpen={true}
            >
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Sia Indexer URL
                  </label>
                  <input
                    type="url"
                    value={siaIndexerUrl}
                    onChange={(e) => setSiaIndexerUrl(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                    style={{
                      background: 'var(--bg)',
                      border: '1px solid var(--border)',
                      color: 'var(--text)',
                    }}
                    placeholder="https://sia.storage"
                    disabled={siaLoading}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Sia App ID
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={siaAppId}
                      onChange={(e) => setSiaAppId(e.target.value)}
                      className="flex-1 px-3 py-2.5 rounded-lg text-sm font-mono outline-none"
                      style={{
                        background: 'var(--bg)',
                        border: '1px solid var(--border)',
                        color: 'var(--text)',
                      }}
                      placeholder="64-character hex string"
                      disabled={siaLoading}
                    />
                    <button
                      type="button"
                      onClick={() => setSiaAppId(generateAppId())}
                      disabled={siaLoading}
                      className="px-3 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap"
                      style={{
                        background: 'rgba(16,185,129,0.1)',
                        color: 'var(--success)',
                        border: '1px solid rgba(16,185,129,0.25)',
                      }}
                    >
                      Generate
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    App Name
                  </label>
                  <input
                    type="text"
                    value={siaAppName}
                    onChange={(e) => setSiaAppName(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                    style={{
                      background: 'var(--bg)',
                      border: '1px solid var(--border)',
                      color: 'var(--text)',
                    }}
                    placeholder="ReBit"
                    disabled={siaLoading}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    App Description (optional)
                  </label>
                  <input
                    type="text"
                    value={siaAppDescription}
                    onChange={(e) => setSiaAppDescription(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                    style={{
                      background: 'var(--bg)',
                      border: '1px solid var(--border)',
                      color: 'var(--text)',
                    }}
                    placeholder="Decentralized video clipping engine"
                    disabled={siaLoading}
                  />
                </div>

                {!siaConnected && (
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      BIP-39 Recovery Phrase
                      <span className="text-xs opacity-50 ml-2">
                        (12 or 24 words never stored)
                      </span>
                    </label>
                    <textarea
                      value={siaRecoveryPhrase}
                      onChange={(e) => setSiaRecoveryPhrase(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-lg text-sm font-mono outline-none resize-none"
                      style={{
                        background: 'var(--bg)',
                        border: '1px solid var(--border)',
                        color: 'var(--text)',
                      }}
                      rows={3}
                      placeholder="Enter your 12 or 24 word recovery phrase..."
                      disabled={siaLoading}
                    />
                    <p className="text-xs opacity-50 mt-1">
                      Your recovery phrase is used once to derive an App Key,
                      then discarded. It is never stored on disk or in the
                      database.
                    </p>
                  </div>
                )}

                {siaConnected && (
                  <div
                    className="flex items-center gap-2 px-4 py-3 rounded-lg"
                    style={{
                      background: 'rgba(16,185,129,0.06)',
                      border: '1px solid rgba(16,185,129,0.2)',
                    }}
                  >
                    <CheckCircle2
                      className="w-4 h-4"
                      style={{ color: 'var(--success)' }}
                    />
                    <span className="text-sm" style={{ color: 'var(--success)' }}>
                      Sia storage configured and connected
                    </span>
                  </div>
                )}

                {siaError && (
                  <div
                    className="px-4 py-3 rounded-lg text-sm"
                    style={{
                      background: 'rgba(239,68,68,0.08)',
                      border: '1px solid rgba(239,68,68,0.25)',
                      color: 'var(--danger)',
                    }}
                  >
                    {siaError}
                  </div>
                )}

                {approvalUrl && !siaConnected ? (
                  <div
                    className="px-4 py-4 rounded-lg space-y-3"
                    style={{
                      background: 'rgba(16,185,129,0.06)',
                      border: '1px solid rgba(16,185,129,0.2)',
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <CheckCircle2
                        className="w-4 h-4"
                        style={{ color: 'var(--success)' }}
                      />
                      <span
                        className="text-sm font-semibold"
                        style={{ color: 'var(--success)' }}
                      >
                        Configuration saved — approval required
                      </span>
                    </div>
                    <p className="text-sm" style={{ color: 'var(--subtle)' }}>
                      Open the URL below to authorize the app on the Sia indexer,
                      then come back and click{' '}
                      <strong>I&apos;ve approved it</strong>.
                    </p>
                    <div className="flex items-center gap-2">
                      <a
                        href={approvalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded text-sm font-medium"
                        style={{
                          background: 'var(--accent)',
                          color: 'var(--accent-fg)',
                        }}
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Open approval URL
                      </a>
                      <button
                        onClick={handleCheckApproval}
                        disabled={checkingApproval}
                        className="flex items-center gap-1.5 px-3 py-2 rounded text-sm font-semibold transition-all disabled:opacity-40"
                        style={{
                          background: 'rgba(16,185,129,0.1)',
                          color: 'var(--success)',
                          border: '1px solid rgba(16,185,129,0.25)',
                        }}
                      >
                        {checkingApproval ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        )}
                        {checkingApproval
                          ? 'Checking\u2026'
                          : "I've approved it"}
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="flex items-center justify-between">
                  <div />
                  <div className="flex items-center gap-3">
                    {siaConnected && (
                      <button
                        onClick={handleSiaReconnect}
                        className="flex items-center gap-1.5 text-sm"
                        style={{ color: 'var(--subtle)' }}
                      >
                        <RefreshCw className="w-3 h-3" /> Re-connect
                      </button>
                    )}
                    {approvalUrl && !siaConnected ? null : siaConnected ? null : (
                      <button
                        onClick={handleSiaSubmit}
                        disabled={
                          !siaIndexerUrl.trim() ||
                          !siaAppId.trim() ||
                          !siaAppName.trim() ||
                          !siaRecoveryPhrase.trim() ||
                          siaLoading
                        }
                        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-40"
                        style={{
                          background: 'var(--accent)',
                          color: 'var(--accent-fg)',
                        }}
                      >
                        {siaLoading ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />{' '}
                            Configuring\u2026
                          </>
                        ) : (
                          'Connect Sia Storage'
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </CollapsibleSection>

            {/* ── YouTube Cookies ──────────────────────────────────── */}
            <CollapsibleSection
              title={
                <span>
                  YouTube Cookies{' '}
                  <span
                    className="text-xs ml-1.5"
                    style={{ color: hasYtCookies ? 'var(--success)' : 'var(--danger)' }}
                  >
                    ({hasYtCookies ? 'Available' : 'Not set'})
                  </span>
                </span>
              }
              icon={<Cookie size={14} style={{ color: hasYtCookies ? 'var(--success)' : 'var(--text-muted)' }} />}
              defaultOpen={!hasYtCookies}
            >
              <div className="space-y-4">
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  YouTube requires authentication to download videos. Export your
                  YouTube cookies from your browser and upload them here so yt-dlp
                  can authenticate on your behalf.
                </p>

                {/* Instructions */}
                <div
                  className="p-3 rounded-lg text-xs space-y-1"
                  style={{
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                    How to export cookies:
                  </p>
                  <ol className="list-decimal list-inside space-y-1">
                    <li>Install the <strong>"Get cookies.txt LOCALLY"</strong> browser extension (Chrome / Firefox)</li>
                    <li>Sign in to <strong>youtube.com</strong> in your browser</li>
                    <li>Click the extension icon and export your cookies as <strong>cookies.txt</strong></li>
                    <li>Upload the exported file below</li>
                  </ol>
                </div>

                {/* Status */}
                {hasYtCookies && (
                  <div
                    className="flex items-center justify-between px-4 py-3 rounded-lg"
                    style={{
                      background: 'rgba(16,185,129,0.06)',
                      border: '1px solid rgba(16,185,129,0.2)',
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <CheckCircle2
                        className="w-4 h-4"
                        style={{ color: 'var(--success)' }}
                      />
                      <span className="text-sm" style={{ color: 'var(--success)' }}>
                        Cookies configured
                      </span>
                    </div>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {ytCookiesSize.toLocaleString()} bytes
                    </span>
                  </div>
                )}

                {/* Upload area */}
                <div
                  className="relative flex flex-col items-center justify-center p-6 rounded-lg border-2 border-dashed transition-colors"
                  style={{
                    borderColor: ytCookiesUploading
                      ? 'var(--accent)'
                      : 'var(--border)',
                    background: ytCookiesUploading
                      ? 'rgba(124,58,237,0.03)'
                      : 'transparent',
                  }}
                >
                  <label
                    htmlFor="yt-cookies-upload"
                    className="flex flex-col items-center gap-2 cursor-pointer"
                  >
                    {ytCookiesUploading ? (
                      <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--accent)' }} />
                    ) : (
                      <Upload className="w-6 h-6" style={{ color: 'var(--text-muted)' }} />
                    )}
                    <span
                      className="text-sm font-medium"
                      style={{ color: ytCookiesUploading ? 'var(--accent)' : 'var(--text-secondary)' }}
                    >
                      {ytCookiesUploading
                        ? 'Uploading…'
                        : hasYtCookies
                          ? 'Click to replace cookies'
                          : 'Click to select cookies.txt'}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      Netscape-format cookies file
                    </span>
                  </label>
                  <input
                    id="yt-cookies-upload"
                    type="file"
                    accept=".txt"
                    onChange={handleYtCookiesUpload}
                    disabled={ytCookiesUploading}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                </div>

                {/* Message */}
                {ytCookiesMsg && (
                  <div
                    className="flex items-start gap-2 px-3 py-2 rounded-lg text-xs"
                    style={{
                      background: ytCookiesMsg.type === 'success'
                        ? 'rgba(16,185,129,0.1)'
                        : 'rgba(239,68,68,0.1)',
                      border: `1px solid ${ytCookiesMsg.type === 'success'
                          ? 'rgba(16,185,129,0.2)'
                          : 'rgba(239,68,68,0.2)'
                        }`,
                      color: ytCookiesMsg.type === 'success' ? 'var(--success)' : 'var(--danger)',
                    }}
                  >
                    {ytCookiesMsg.type === 'success'
                      ? <CheckCircle2 size={12} className="flex-shrink-0 mt-0.5" />
                      : <AlertCircle size={12} className="flex-shrink-0 mt-0.5" />
                    }
                    {ytCookiesMsg.text}
                  </div>
                )}

                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Your cookies are stored on the server and used only for
                  YouTube authentication via yt-dlp. They are never shared
                  with third parties.
                </p>
              </div>
            </CollapsibleSection>

            {/* ── OAuth Providers ──────────────────────────────────── */}
            <CollapsibleSection
              title={
                <span>
                  OAuth Providers{' '}
                  <span className="text-xs ml-1.5" style={{ color: 'var(--text-muted)' }}>
                    ({[hasGoogle && 'Google', hasGitHub && 'GitHub'].filter(Boolean).join(', ') || 'None configured'})
                  </span>
                </span>
              }
              icon={<Shield size={14} style={{ color: 'var(--text-muted)' }} />}
            >
              <div className="space-y-4">
                {/* Google */}
                <div
                  className="p-3 rounded-lg"
                  style={{
                    border: '1px solid var(--border)',
                    background: 'var(--bg)',
                  }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Globe size={14} style={{ color: 'var(--subtle)' }} />
                    <span className="text-xs font-semibold">Google OAuth</span>
                    {hasGoogle && (
                      <CheckCircle2 size={12} style={{ color: 'var(--success)', marginLeft: 'auto' }} />
                    )}
                  </div>
                  <div
                    className="px-3 py-1.5 rounded-lg mb-2 text-[10px]"
                    style={{
                      background: 'rgba(59,130,246,0.08)',
                      border: '1px solid rgba(59,130,246,0.2)',
                      color: 'var(--blue)',
                    }}
                  >
                    Callback URL:
                    <br />
                    <strong className="select-all">
                      {typeof window !== 'undefined'
                        ? window.location.origin
                        : 'http://localhost:3000'}
                      /api/auth/callback/google
                    </strong>
                  </div>
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={googleClientId}
                      onChange={(e) => setGoogleClientId(e.target.value)}
                      placeholder={hasGoogle ? 'Client ID (change to update)' : 'Client ID'}
                      className="w-full px-3 py-1.5 rounded-lg text-xs outline-none"
                      style={{
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        color: 'var(--text)',
                      }}
                    />
                    <div className="relative">
                      <input
                        type={showGoogleSecret ? 'text' : 'password'}
                        value={googleClientSecret}
                        onChange={(e) => setGoogleClientSecret(e.target.value)}
                        placeholder={hasGoogle ? 'Client Secret (change to update)' : 'Client Secret'}
                        className="w-full px-3 py-1.5 rounded-lg text-xs outline-none pr-8"
                        style={{
                          background: 'var(--surface)',
                          border: '1px solid var(--border)',
                          color: 'var(--text)',
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowGoogleSecret(!showGoogleSecret)}
                        className="absolute right-2 top-1/2 -translate-y-1/2"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {showGoogleSecret ? <EyeOff size={12} /> : <Eye size={12} />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* GitHub */}
                <div
                  className="p-3 rounded-lg"
                  style={{
                    border: '1px solid var(--border)',
                    background: 'var(--bg)',
                  }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <GitFork size={14} style={{ color: 'var(--subtle)' }} />
                    <span className="text-xs font-semibold">GitHub OAuth</span>
                    {hasGitHub && (
                      <CheckCircle2 size={12} style={{ color: 'var(--success)', marginLeft: 'auto' }} />
                    )}
                  </div>
                  <div
                    className="px-3 py-1.5 rounded-lg mb-2 text-[10px]"
                    style={{
                      background: 'rgba(59,130,246,0.08)',
                      border: '1px solid rgba(59,130,246,0.2)',
                      color: 'var(--blue)',
                    }}
                  >
                    Callback URL:
                    <br />
                    <strong className="select-all">
                      {typeof window !== 'undefined'
                        ? window.location.origin
                        : 'http://localhost:3000'}
                      /api/auth/callback/github
                    </strong>
                  </div>
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={githubClientId}
                      onChange={(e) => setGithubClientId(e.target.value)}
                      placeholder={hasGitHub ? 'Client ID (change to update)' : 'Client ID'}
                      className="w-full px-3 py-1.5 rounded-lg text-xs outline-none"
                      style={{
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        color: 'var(--text)',
                      }}
                    />
                    <div className="relative">
                      <input
                        type={showGithubSecret ? 'text' : 'password'}
                        value={githubClientSecret}
                        onChange={(e) => setGithubClientSecret(e.target.value)}
                        placeholder={hasGitHub ? 'Client Secret (change to update)' : 'Client Secret'}
                        className="w-full px-3 py-1.5 rounded-lg text-xs outline-none pr-8"
                        style={{
                          background: 'var(--surface)',
                          border: '1px solid var(--border)',
                          color: 'var(--text)',
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowGithubSecret(!showGithubSecret)}
                        className="absolute right-2 top-1/2 -translate-y-1/2"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {showGithubSecret ? <EyeOff size={12} /> : <Eye size={12} />}
                      </button>
                    </div>
                  </div>
                </div>

                {provError && (
                  <div
                    className="flex items-start gap-2 px-3 py-2 rounded-lg text-xs"
                    style={{
                      background: 'rgba(239,68,68,0.1)',
                      border: '1px solid rgba(239,68,68,0.2)',
                      color: 'var(--danger)',
                    }}
                  >
                    <AlertCircle size={12} className="flex-shrink-0 mt-0.5" />
                    {provError}
                  </div>
                )}

                <div className="flex justify-end">
                  <button
                    onClick={handleProvidersSave}
                    disabled={
                      (!googleClientId.trim() && !githubClientId.trim()) ||
                      provSaving
                    }
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-40"
                    style={{
                      background: 'var(--accent)',
                      color: 'var(--accent-fg)',
                    }}
                  >
                    {provSaving ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : null}
                    {provSaving ? 'Saving…' : 'Save Providers'}
                  </button>
                </div>
              </div>
            </CollapsibleSection>
          </div>
        )}
      </div>
    </div>
  );
}