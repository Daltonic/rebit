'use client';

import { useState, useEffect, useReducer } from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2,
  Loader2,
  ExternalLink,
  ChevronRight,
  ArrowLeft,
  Sparkles,
  GitFork,
  Globe,
  RefreshCw,
  UserPlus,
} from 'lucide-react';
import type { SetupStatus, SiaRegistrationResponse, SiaCheckResponse } from '@/lib/types';

// ── Step Configuration ─────────────────────────────────────────────────

type Step = 'sia' | 'providers' | 'signup';

const STEP_ORDER: Step[] = ['sia', 'providers', 'signup'];

const STEP_LABELS: Record<Step, string> = {
  sia: 'Sia Storage',
  providers: 'Providers',
  signup: 'Sign Up',
};

// ── Helper: Generate Random App ID ─────────────────────────────────────

function generateAppId(): string {
  const chars = '0123456789abcdef';
  let result = '';
  for (let i = 0; i < 64; i++) {
    result += chars[Math.floor(Math.random() * 16)];
  }
  return result;
}

// ── Reducer for Persisted Setup State ──────────────────────────────────

type SetupState = {
  loading: boolean;
  step: Step;
  siaConfirmed: boolean;
  provConfirmed: boolean;
  siaIndexerUrl: string;
  siaAppId: string;
  siaAppName: string;
  siaAppDescription: string;
  webauthnRpId: string;
  webauthnOrigin: string;
};

type SetupAction =
  | { type: 'LOAD_PERSISTED'; payload: Partial<SetupState> }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_STEP'; payload: Step }
  | { type: 'SET_SIA_CONFIRMED'; payload: boolean }
  | { type: 'SET_PROV_CONFIRMED'; payload: boolean }
  | { type: 'SET_SIA_INDEXER_URL'; payload: string }
  | { type: 'SET_SIA_APP_ID'; payload: string }
  | { type: 'SET_SIA_APP_NAME'; payload: string }
  | { type: 'SET_SIA_APP_DESCRIPTION'; payload: string }
  | { type: 'SET_WEBAUTHN_RP_ID'; payload: string }
  | { type: 'SET_WEBAUTHN_ORIGIN'; payload: string };

function setupReducer(state: SetupState, action: SetupAction): SetupState {
  switch (action.type) {
    case 'LOAD_PERSISTED':
      return { ...state, ...action.payload };
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    case 'SET_STEP':
      return { ...state, step: action.payload };
    case 'SET_SIA_CONFIRMED':
      return { ...state, siaConfirmed: action.payload };
    case 'SET_PROV_CONFIRMED':
      return { ...state, provConfirmed: action.payload };
    case 'SET_SIA_INDEXER_URL':
      return { ...state, siaIndexerUrl: action.payload };
    case 'SET_SIA_APP_ID':
      return { ...state, siaAppId: action.payload };
    case 'SET_SIA_APP_NAME':
      return { ...state, siaAppName: action.payload };
    case 'SET_SIA_APP_DESCRIPTION':
      return { ...state, siaAppDescription: action.payload };
    case 'SET_WEBAUTHN_RP_ID':
      return { ...state, webauthnRpId: action.payload };
    case 'SET_WEBAUTHN_ORIGIN':
      return { ...state, webauthnOrigin: action.payload };
    default:
      return state;
  }
}

const initialSetupState: SetupState = {
  loading: true,
  step: 'sia',
  siaConfirmed: false,
  provConfirmed: false,
  siaIndexerUrl: 'https://sia.storage',
  siaAppId: '',
  siaAppName: 'ReBit',
  siaAppDescription: 'Decentralized video clipping engine',
  webauthnRpId:
    typeof window !== 'undefined' ? window.location.hostname : 'localhost',
  webauthnOrigin:
    typeof window !== 'undefined'
      ? window.location.origin
      : 'http://localhost:3000',
};

// ── Setup Wizard Page ──────────────────────────────────────────────────

export default function SetupPage() {
  const router = useRouter();

  // ── State ──────────────────────────────────────────────────────────

  const [state, dispatch] = useReducer(setupReducer, initialSetupState);

  // Sia state (not persisted)
  const [siaRecoveryPhrase, setSiaRecoveryPhrase] = useState('');
  const [siaLoading, setSiaLoading] = useState(false);
  const [siaError, setSiaError] = useState<string | null>(null);
  const [approvalUrl, setApprovalUrl] = useState<string | null>(null);
  const [checkingApproval, setCheckingApproval] = useState(false);

  // Providers state (not persisted)
  const [googleClientId, setGoogleClientId] = useState('');
  const [googleClientSecret, setGoogleClientSecret] = useState('');
  const [githubClientId, setGithubClientId] = useState('');
  const [githubClientSecret, setGithubClientSecret] = useState('');
  const [provLoading, setProvLoading] = useState(false);
  const [provError, setProvError] = useState<string | null>(null);

  // Finishing state
  const [finishing, setFinishing] = useState(false);

  // ── Load Persisted State from DB on Mount ──────────────────────────

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch('/api/setup/status');
        const data: SetupStatus = await res.json();

        if (cancelled) return;

        if (data.setupComplete) {
          router.push('/login')
          return;
        }

        const updates: Partial<SetupState> = { loading: false };

        // Restore Sia state
        if (data.siaConnected) {
          updates.siaConfirmed = true;
          if (data.siaIndexerUrl) updates.siaIndexerUrl = data.siaIndexerUrl;
          if (data.siaAppId) updates.siaAppId = data.siaAppId;
          if (data.siaAppName) updates.siaAppName = data.siaAppName;
          if (data.siaAppDescription)
            updates.siaAppDescription = data.siaAppDescription;
        }

        // Restore providers state
        if (data.hasGoogle || data.hasGitHub || data.hasWebauthn) {
          updates.provConfirmed = true;
        }

        // Fetch provider details
        try {
          const provRes = await fetch('/api/setup/providers');
          const provData = await provRes.json();
          if (provData.webauthnRpId)
            updates.webauthnRpId = provData.webauthnRpId;
          if (provData.webauthnOrigin)
            updates.webauthnOrigin = provData.webauthnOrigin;
        } catch {
          // ignore
        }

        // Determine first incomplete step
        if (!data.siaConnected) updates.step = 'sia';
        else if (!data.hasGoogle && !data.hasGitHub && !data.hasWebauthn)
          updates.step = 'providers';
        else updates.step = 'signup';

        dispatch({ type: 'LOAD_PERSISTED', payload: updates });
      } catch {
        if (!cancelled) {
          dispatch({ type: 'SET_LOADING', payload: false });
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  // ── Navigation ─────────────────────────────────────────────────────

  function goTo(s: Step) {
    dispatch({ type: 'SET_STEP', payload: s });
    setSiaError(null);
    setProvError(null);
  }

  // ── Sia Handlers ───────────────────────────────────────────────────

  async function handleSiaSubmit() {
    if (
      !state.siaIndexerUrl.trim() ||
      !state.siaAppId.trim() ||
      !state.siaAppName.trim()
    )
      return;
    setSiaLoading(true);
    setSiaError(null);
    setApprovalUrl(null);

    try {
      const res = await fetch('/api/setup/sia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siaIndexerUrl: state.siaIndexerUrl.trim(),
          siaAppId: state.siaAppId.trim(),
          siaAppName: state.siaAppName.trim(),
          siaAppDescription: state.siaAppDescription.trim(),
          recoveryPhrase: siaRecoveryPhrase.trim(),
        }),
      });

      const data: SiaRegistrationResponse = await res.json();

      if (!data.ok) {
        if (data.already_connected) {
          dispatch({ type: 'SET_SIA_CONFIRMED', payload: true });
          return;
        }
        setSiaError(data.error || 'Registration failed');
        return;
      }

      if (data.approval_url) {
        setApprovalUrl(data.approval_url);
      }
    } catch (err) {
      setSiaError(
        err instanceof Error ? err.message : 'Failed to contact server'
      );
    } finally {
      setSiaLoading(false);
    }
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
        dispatch({ type: 'SET_SIA_CONFIRMED', payload: true });
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

  // ── Providers Handler ──────────────────────────────────────────────

  async function handleProvidersSubmit() {
    if (!googleClientId.trim() && !githubClientId.trim()) return;
    setProvLoading(true);
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
          webauthnRpId: state.webauthnRpId.trim() || undefined,
          webauthnOrigin: state.webauthnOrigin.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to save');
      dispatch({ type: 'SET_PROV_CONFIRMED', payload: true });
    } catch (err) {
      setProvError(
        err instanceof Error ? err.message : 'Something went wrong'
      );
    } finally {
      setProvLoading(false);
    }
  }

  // ── Complete Setup ─────────────────────────────────────────────────

  async function handleFinish() {
    setFinishing(true);
    try {
      await fetch('/api/setup/complete', { method: 'POST' });
      router.push('/login');
    } catch {
      router.push('/login');
    }
  }

  // ── Loading State ──────────────────────────────────────────────────

  if (state.loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: 'var(--bg)' }}
      >
        <Loader2
          className="w-6 h-6 animate-spin"
          style={{ color: 'var(--subtle)' }}
        />
      </div>
    );
  }

  // Completion state for each step
  const stepsState: Record<Step, boolean> = {
    sia: state.siaConfirmed,
    providers: state.provConfirmed,
    signup: false,
  };

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <div
      className="min-h-screen flex items-start justify-center pt-12 px-4 pb-12"
      style={{ background: 'var(--bg)' }}
    >
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">Welcome to ReBit</h1>
          <p className="opacity-60">
            Let&apos;s get you set up in a few steps
          </p>
        </div>

        {/* ── Interactive Step Indicators ── */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {STEP_ORDER.map((s, i) => {
            const isDone = stepsState[s];
            const isActive = state.step === s;
            return (
              <div key={s} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => goTo(s)}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all cursor-pointer"
                  style={{
                    background: isDone
                      ? 'var(--success)'
                      : isActive
                        ? 'rgba(16,185,129,0.15)'
                        : 'var(--border)',
                    color: isDone
                      ? '#fff'
                      : isActive
                        ? 'var(--success)'
                        : 'var(--subtle)',
                    border: isActive
                      ? '1px solid rgba(16,185,129,0.4)'
                      : '1px solid transparent',
                  }}
                  title={
                    isDone
                      ? `${STEP_LABELS[s]} completed (click to re-do)`
                      : isActive
                        ? `${STEP_LABELS[s]} current step`
                        : STEP_LABELS[s]
                  }
                >
                  {isDone ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
                </button>
                {i < STEP_ORDER.length - 1 && (
                  <div
                    className="w-12 h-px"
                    style={{
                      background: stepsState[STEP_ORDER[i]]
                        ? 'var(--success)'
                        : 'var(--border)',
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Subtitle showing what's completed */}
        <div className="text-center mb-6">
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            {state.siaConfirmed && '\u2714 Sia connected '}
            {state.siaConfirmed && state.provConfirmed && '\u2022 '}
            {state.provConfirmed && '\u2714 Providers configured '}
            {!state.siaConfirmed && !state.provConfirmed &&
              'No steps completed yet'}
          </p>
        </div>

        {/* ── Step Content ── */}
        <div
          className="rounded-xl p-8"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
          }}
        >
          {/* ── Step 1: Sia ─────────────────────────────────────────── */}
          {state.step === 'sia' && (
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="text-xl font-semibold mb-2">
                  Sia Decentralized Storage
                </h2>
                <p className="text-sm opacity-60">
                  {state.siaConfirmed
                    ? 'Sia is already configured. You can update the settings below.'
                    : 'Connect to the Sia network for decentralized file storage. All uploaded videos and clips will be stored on Sia.'}
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Sia Indexer URL
                  </label>
                  <input
                    type="url"
                    value={state.siaIndexerUrl}
                    onChange={(e) =>
                      dispatch({
                        type: 'SET_SIA_INDEXER_URL',
                        payload: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                    style={{
                      background: 'var(--bg)',
                      border: '1px solid var(--border)',
                      color: 'var(--text)',
                      opacity: state.siaConfirmed && !siaLoading ? 0.6 : 1,
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
                      value={state.siaAppId}
                      onChange={(e) =>
                        dispatch({
                          type: 'SET_SIA_APP_ID',
                          payload: e.target.value,
                        })
                      }
                      className="flex-1 px-3 py-2.5 rounded-lg text-sm font-mono outline-none"
                      style={{
                        background: 'var(--bg)',
                        border: '1px solid var(--border)',
                        color: 'var(--text)',
                        opacity: state.siaConfirmed && !siaLoading ? 0.6 : 1,
                      }}
                      placeholder="64-character hex string"
                      disabled={siaLoading}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        dispatch({
                          type: 'SET_SIA_APP_ID',
                          payload: generateAppId(),
                        })
                      }
                      disabled={siaLoading}
                      className="px-3 py-2.5 rounded-lg text-sm font-medium"
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
                    value={state.siaAppName}
                    onChange={(e) =>
                      dispatch({
                        type: 'SET_SIA_APP_NAME',
                        payload: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                    style={{
                      background: 'var(--bg)',
                      border: '1px solid var(--border)',
                      color: 'var(--text)',
                      opacity: state.siaConfirmed && !siaLoading ? 0.6 : 1,
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
                    value={state.siaAppDescription}
                    onChange={(e) =>
                      dispatch({
                        type: 'SET_SIA_APP_DESCRIPTION',
                        payload: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                    style={{
                      background: 'var(--bg)',
                      border: '1px solid var(--border)',
                      color: 'var(--text)',
                      opacity: state.siaConfirmed && !siaLoading ? 0.6 : 1,
                    }}
                    placeholder="Decentralized video clipping engine"
                    disabled={siaLoading}
                  />
                </div>

                {!state.siaConfirmed && (
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
                    />
                    <p className="text-xs opacity-50 mt-1">
                      Your recovery phrase is used once to derive an App Key,
                      then discarded. It is never stored on disk or in the
                      database.
                    </p>
                  </div>
                )}
              </div>

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

              {approvalUrl && !state.siaConfirmed ? (
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
                      Configuration saved approval required
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
              ) : state.siaConfirmed && (
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

              <div className="flex items-center justify-between">
                <div />
                <div className="flex items-center gap-3">
                  {state.siaConfirmed && (
                    <button
                      onClick={() =>
                        dispatch({
                          type: 'SET_SIA_CONFIRMED',
                          payload: false,
                        })
                      }
                      className="flex items-center gap-1.5 text-sm"
                      style={{ color: 'var(--subtle)' }}
                    >
                      <RefreshCw className="w-3 h-3" /> Re-do
                    </button>
                  )}
                  {approvalUrl && !state.siaConfirmed ? null : state
                    .siaConfirmed ? (
                    <button
                      onClick={() => goTo('providers')}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold"
                      style={{
                        background: 'var(--accent)',
                        color: 'var(--accent-fg)',
                      }}
                    >
                      Next step <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <button
                      onClick={handleSiaSubmit}
                      disabled={
                        !state.siaIndexerUrl.trim() ||
                        !state.siaAppId.trim() ||
                        !state.siaAppName.trim() ||
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
                        'Start Sia Registration'
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Step 2: Providers ───────────────────────────────────── */}
          {state.step === 'providers' && (
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="text-xl font-semibold mb-2">
                  Authentication Providers
                </h2>
                <p className="text-sm opacity-60">
                  {state.provConfirmed
                    ? 'Providers have been configured. You can update them below.'
                    : 'Configure at least one OAuth provider so users can sign in. All fields are optional you can skip this step and configure later.'}
                </p>
              </div>

              <div className="space-y-6">
                {/* Google */}
                <div
                  className="p-4 rounded-lg"
                  style={{
                    border: '1px solid var(--border)',
                    background: 'var(--bg)',
                  }}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <Globe
                      className="w-4 h-4"
                      style={{ color: 'var(--subtle)' }}
                    />
                    <span className="text-sm font-semibold">Google OAuth</span>
                  </div>
                  <div
                    className="px-3 py-2 rounded-lg mb-3 text-xs"
                    style={{
                      background: 'rgba(59,130,246,0.08)',
                      border: '1px solid rgba(59,130,246,0.2)',
                      color: 'var(--blue)',
                    }}
                  >
                    Set the callback URL in Google Cloud Console to:
                    <br />
                    <strong className="select-all">
                      {typeof window !== 'undefined'
                        ? window.location.origin
                        : 'http://localhost:3000'}
                      /api/auth/callback/google
                    </strong>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label
                        className="block text-xs mb-1"
                        style={{ color: 'var(--subtle)' }}
                      >
                        Client ID
                      </label>
                      <input
                        type="text"
                        value={googleClientId}
                        onChange={(e) => setGoogleClientId(e.target.value)}
                        placeholder="xxx.apps.googleusercontent.com"
                        className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                        style={{
                          background: 'var(--surface)',
                          border: '1px solid var(--border)',
                          color: 'var(--text)',
                        }}
                      />
                    </div>
                    <div>
                      <label
                        className="block text-xs mb-1"
                        style={{ color: 'var(--subtle)' }}
                      >
                        Client Secret
                      </label>
                      <input
                        type="password"
                        value={googleClientSecret}
                        onChange={(e) => setGoogleClientSecret(e.target.value)}
                        placeholder="GOCSX-..."
                        className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                        style={{
                          background: 'var(--surface)',
                          border: '1px solid var(--border)',
                          color: 'var(--text)',
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* GitHub */}
                <div
                  className="p-4 rounded-lg"
                  style={{
                    border: '1px solid var(--border)',
                    background: 'var(--bg)',
                  }}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <GitFork
                      className="w-4 h-4"
                      style={{ color: 'var(--subtle)' }}
                    />
                    <span className="text-sm font-semibold">GitHub OAuth</span>
                  </div>
                  <div
                    className="px-3 py-2 rounded-lg mb-3 text-xs"
                    style={{
                      background: 'rgba(59,130,246,0.08)',
                      border: '1px solid rgba(59,130,246,0.2)',
                      color: 'var(--blue)',
                    }}
                  >
                    Set the callback URL in GitHub OAuth settings to:
                    <br />
                    <strong className="select-all">
                      {typeof window !== 'undefined'
                        ? window.location.origin
                        : 'http://localhost:3000'}
                      /api/auth/callback/github
                    </strong>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label
                        className="block text-xs mb-1"
                        style={{ color: 'var(--subtle)' }}
                      >
                        Client ID
                      </label>
                      <input
                        type="text"
                        value={githubClientId}
                        onChange={(e) => setGithubClientId(e.target.value)}
                        placeholder="Ov23..."
                        className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                        style={{
                          background: 'var(--surface)',
                          border: '1px solid var(--border)',
                          color: 'var(--text)',
                        }}
                      />
                    </div>
                    <div>
                      <label
                        className="block text-xs mb-1"
                        style={{ color: 'var(--subtle)' }}
                      >
                        Client Secret
                      </label>
                      <input
                        type="password"
                        value={githubClientSecret}
                        onChange={(e) => setGithubClientSecret(e.target.value)}
                        placeholder="cf14..."
                        className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                        style={{
                          background: 'var(--surface)',
                          border: '1px solid var(--border)',
                          color: 'var(--text)',
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {provError && (
                <div
                  className="px-4 py-3 rounded-lg text-sm"
                  style={{
                    background: 'rgba(239,68,68,0.08)',
                    border: '1px solid rgba(239,68,68,0.25)',
                    color: 'var(--danger)',
                  }}
                >
                  {provError}
                </div>
              )}

              {state.provConfirmed && (
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
                    Provider configuration saved
                  </span>
                </div>
              )}

              <div className="flex items-center justify-between">
                <button
                  onClick={() => goTo('sia')}
                  className="flex items-center gap-1.5 text-sm"
                  style={{ color: 'var(--subtle)' }}
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Back
                </button>
                <div className="flex items-center gap-3">
                  {state.provConfirmed && (
                    <button
                      onClick={() =>
                        dispatch({
                          type: 'SET_PROV_CONFIRMED',
                          payload: false,
                        })
                      }
                      className="flex items-center gap-1.5 text-sm"
                      style={{ color: 'var(--subtle)' }}
                    >
                      <RefreshCw className="w-3 h-3" /> Re-do
                    </button>
                  )}
                  {!state.provConfirmed ? (
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          dispatch({
                            type: 'SET_PROV_CONFIRMED',
                            payload: true,
                          });
                          goTo('signup');
                        }}
                        className="px-3 py-2 rounded-lg text-sm font-medium"
                        style={{ border: '1px solid var(--border)' }}
                      >
                        Skip
                      </button>
                      <button
                        onClick={handleProvidersSubmit}
                        disabled={
                          (!googleClientId.trim() && !githubClientId.trim()) ||
                          provLoading
                        }
                        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-40"
                        style={{
                          background: 'var(--accent)',
                          color: 'var(--accent-fg)',
                        }}
                      >
                        {provLoading ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />{' '}
                            Saving\u2026
                          </>
                        ) : (
                          'Save providers'
                        )}
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => goTo('signup')}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold"
                      style={{
                        background: 'var(--accent)',
                        color: 'var(--accent-fg)',
                      }}
                    >
                      Next step <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Step 3: Sign Up ─────────────────────────────────────── */}
          {state.step === 'signup' && (
            <div className="space-y-6 text-center">
              <div
                className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-2"
                style={{
                  background: 'rgba(16,185,129,0.1)',
                  border: '1px solid rgba(16,185,129,0.25)',
                }}
              >
                <Sparkles
                  className="w-8 h-8"
                  style={{ color: 'var(--success)' }}
                />
              </div>

              <div>
                <h2 className="text-xl font-semibold mb-2">
                  You&apos;re all configured!
                </h2>
                <p className="text-sm opacity-60">
                  Everything is set up. Now create your account to become the
                  platform super admin. The first person to sign up gets full
                  administrative control.
                </p>
              </div>

              <div className="space-y-2 text-left">
                {[
                  {
                    label: 'Sia storage configured',
                    done: state.siaConfirmed,
                  },
                  {
                    label: 'Social login providers configured',
                    done: state.provConfirmed,
                  },
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-2">
                    {item.done ? (
                      <CheckCircle2
                        className="w-4 h-4"
                        style={{ color: 'var(--success)' }}
                      />
                    ) : (
                      <div
                        className="w-4 h-4 rounded-full border-2"
                        style={{ borderColor: 'var(--muted)' }}
                      />
                    )}
                    <span
                      className="text-sm"
                      style={{
                        color: item.done ? 'var(--text)' : 'var(--subtle)',
                      }}
                    >
                      {item.label}
                    </span>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between">
                <button
                  onClick={() => goTo('providers')}
                  className="flex items-center gap-1.5 text-sm"
                  style={{ color: 'var(--subtle)' }}
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Back
                </button>
                <button
                  onClick={handleFinish}
                  disabled={finishing}
                  className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-semibold transition-all disabled:opacity-40"
                  style={{
                    background: 'var(--accent)',
                    color: 'var(--accent-fg)',
                  }}
                >
                  {finishing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <UserPlus className="w-4 h-4" />
                  )}
                  {finishing ? 'Redirecting\u2026' : 'Create your account \u2192'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}