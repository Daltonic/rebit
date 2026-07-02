'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ChevronRight, ExternalLink, Loader2, Server, Key, Shield, UserPlus } from 'lucide-react';
import type { SetupStatus, SiaRegistrationResponse, SiaCheckResponse } from '@/lib/types';

// ── Step Configuration ─────────────────────────────────────────────────

const STEPS = [
  { id: 'sia', label: 'Sia Storage', icon: Server },
  { id: 'openrouter', label: 'OpenRouter', icon: Key },
  { id: 'providers', label: 'Providers', icon: Shield },
  { id: 'signup', label: 'Sign Up', icon: UserPlus },
] as const;

type StepId = (typeof STEPS)[number]['id'];

// ── Helper: Generate Random App ID ─────────────────────────────────────

function generateAppId(): string {
  const chars = '0123456789abcdef';
  let result = '';
  for (let i = 0; i < 64; i++) {
    result += chars[Math.floor(Math.random() * 16)];
  }
  return result;
}

// ── Setup Wizard Page ──────────────────────────────────────────────────

export default function SetupPage() {
  const router = useRouter();

  // ── State ──────────────────────────────────────────────────────────

  const [loading, setLoading] = useState(true);
  const [currentStep, setCurrentStep] = useState<StepId>('sia');
  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);

  // Sia step state
  const [siaIndexerUrl, setSiaIndexerUrl] = useState('https://sia.storage');
  const [siaAppId, setSiaAppId] = useState('');
  const [siaAppName, setSiaAppName] = useState('ReBit');
  const [siaAppDescription, setSiaAppDescription] = useState('Decentralized video clipping engine');
  const [siaRecoveryPhrase, setSiaRecoveryPhrase] = useState('');
  const [approvalUrl, setApprovalUrl] = useState<string | null>(null);
  const [siaLoading, setSiaLoading] = useState(false);
  const [siaError, setSiaError] = useState<string | null>(null);
  const [siaConfirmed, setSiaConfirmed] = useState(false);
  const [checkingApproval, setCheckingApproval] = useState(false);

  // OpenRouter step state
  const [openrouterKey, setOpenrouterKey] = useState('');
  const [orLoading, setOrLoading] = useState(false);
  const [orError, setOrError] = useState<string | null>(null);
  const [orConfirmed, setOrConfirmed] = useState(false);

  // Providers step state
  const [googleClientId, setGoogleClientId] = useState('');
  const [googleClientSecret, setGoogleClientSecret] = useState('');
  const [githubClientId, setGithubClientId] = useState('');
  const [githubClientSecret, setGithubClientSecret] = useState('');
  const [webauthnRpId, setWebauthnRpId] = useState('');
  const [webauthnOrigin, setWebauthnOrigin] = useState('');
  const [provLoading, setProvLoading] = useState(false);
  const [provError, setProvError] = useState<string | null>(null);
  const [provConfirmed, setProvConfirmed] = useState(false);

  // ── Load Setup Status on Mount ─────────────────────────────────────

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/setup/status');
        if (res.ok) {
          const data: SetupStatus = await res.json();
          setSetupStatus(data);

          // Pre-fill from existing config
          if (data.siaIndexerUrl) setSiaIndexerUrl(data.siaIndexerUrl);
          if (data.siaAppId) setSiaAppId(data.siaAppId);
          if (data.siaAppName) setSiaAppName(data.siaAppName);
          if (data.siaAppDescription) setSiaAppDescription(data.siaAppDescription);

          // Determine which step to show
          if (data.setupComplete) {
            router.push('/');
            return;
          }
          if (data.siaConnected) setSiaConfirmed(true);
          if (data.hasOpenrouterKey) setOrConfirmed(true);
          if (data.hasGoogle || data.hasGitHub || data.hasWebauthn) setProvConfirmed(true);

          // Find first incomplete step
          if (!data.siaConnected) setCurrentStep('sia');
          else if (!data.hasOpenrouterKey) setCurrentStep('openrouter');
          else if (!data.hasGoogle && !data.hasGitHub && !data.hasWebauthn) setCurrentStep('providers');
          else setCurrentStep('signup');
        }
      } catch (err) {
        console.error('Failed to load setup status:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [router]);

  // ── Step Navigation ────────────────────────────────────────────────

  const goToStep = useCallback((step: StepId) => {
    setCurrentStep(step);
    setSiaError(null);
    setOrError(null);
    setProvError(null);
  }, []);

  const isStepComplete = useCallback(
    (step: StepId): boolean => {
      switch (step) {
        case 'sia': return siaConfirmed;
        case 'openrouter': return orConfirmed;
        case 'providers': return provConfirmed;
        case 'signup': return false;
      }
    },
    [siaConfirmed, orConfirmed, provConfirmed]
  );

  // ── Sia Handlers ───────────────────────────────────────────────────

  async function handleSiaSubmit() {
    setSiaLoading(true);
    setSiaError(null);

    try {
      const res = await fetch('/api/setup/sia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siaIndexerUrl,
          siaAppId,
          siaAppName,
          siaAppDescription,
          recoveryPhrase: siaRecoveryPhrase,
        }),
      });

      const data: SiaRegistrationResponse = await res.json();

      if (!data.ok) {
        if (data.already_connected) {
          setSiaConfirmed(true);
          return;
        }
        setSiaError(data.error || 'Registration failed');
        return;
      }

      if (data.approval_url) {
        setApprovalUrl(data.approval_url);
      }
    } catch (err) {
      setSiaError(err instanceof Error ? err.message : 'Failed to contact server');
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
        setSiaConfirmed(true);
        setApprovalUrl(null);
        setSiaRecoveryPhrase(''); // Clear from memory
      } else if (data.ok && data.status === 'pending') {
        setSiaError('Still pending approval. Please approve the app on the Sia indexer and try again.');
      } else {
        setSiaError(data.error || 'Failed to check approval status');
      }
    } catch (err) {
      setSiaError(err instanceof Error ? err.message : 'Failed to check approval');
    } finally {
      setCheckingApproval(false);
    }
  }

  // ── OpenRouter Handler ─────────────────────────────────────────────

  async function handleOrSubmit() {
    setOrLoading(true);
    setOrError(null);

    try {
      const res = await fetch('/api/setup/openrouter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ openrouterKey }),
      });

      if (res.ok) {
        setOrConfirmed(true);
      } else {
        const data = await res.json();
        setOrError(data.error || 'Failed to save OpenRouter key');
      }
    } catch (err) {
      setOrError(err instanceof Error ? err.message : 'Failed to save OpenRouter key');
    } finally {
      setOrLoading(false);
    }
  }

  // ── Providers Handler ──────────────────────────────────────────────

  async function handleProvSubmit() {
    setProvLoading(true);
    setProvError(null);

    try {
      // Save provider configs to AppSettings
      const res = await fetch('/api/setup/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          googleClientId,
          googleClientSecret,
          githubClientId,
          githubClientSecret,
          webauthnRpId,
          webauthnOrigin,
        }),
      });

      if (res.ok) {
        setProvConfirmed(true);
      } else {
        const data = await res.json();
        setProvError(data.error || 'Failed to save provider configuration');
      }
    } catch (err) {
      setProvError(err instanceof Error ? err.message : 'Failed to save provider configuration');
    } finally {
      setProvLoading(false);
    }
  }

  // ── Complete Setup ─────────────────────────────────────────────────

  async function handleCompleteSetup() {
    try {
      await fetch('/api/setup/complete', { method: 'POST' });
      router.push('/login');
    } catch (err) {
      console.error('Failed to complete setup:', err);
    }
  }

  // ── Loading State ──────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="animate-spin" size={32} />
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-3xl font-bold mb-2">Welcome to ReBit</h1>
          <p className="opacity-60">Let's get you set up in a few steps</p>
        </div>

        {/* Step Indicators */}
        <div className="flex items-center justify-center gap-2 mb-12">
          {STEPS.map((step, i) => {
            const StepIcon = step.icon;
            const complete = isStepComplete(step.id);
            const active = currentStep === step.id;

            return (
              <div key={step.id} className="flex items-center gap-2">
                {i > 0 && (
                  <div
                    className="w-8 h-px"
                    style={{ background: complete ? 'var(--accent)' : 'var(--border)' }}
                  />
                )}
                <button
                  onClick={() => goToStep(step.id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all
                    ${active ? 'bg-accent/10 text-accent' : ''}
                    ${complete ? 'text-success' : 'opacity-50'}
                  `}
                >
                  <StepIcon size={16} />
                  <span className="hidden sm:inline">{step.label}</span>
                  {complete && <Check size={14} />}
                </button>
              </div>
            );
          })}
        </div>

        {/* Step Content */}
        <div className="rounded-xl p-8" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          {/* ── Step 1: Sia ─────────────────────────────────────────── */}
          {currentStep === 'sia' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold mb-1">Sia Decentralized Storage</h2>
                <p className="text-sm opacity-60">
                  Connect to the Sia network for decentralized file storage.
                  All uploaded videos and clips will be stored on Sia.
                </p>
              </div>

              {siaConfirmed ? (
                <div className="p-4 rounded-lg" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}>
                  <div className="flex items-center gap-2 text-success">
                    <Check size={20} />
                    <span className="font-medium">Sia storage configured and connected</span>
                  </div>
                </div>
              ) : approvalUrl ? (
                <div className="space-y-4">
                  <div className="p-4 rounded-lg" style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)' }}>
                    <p className="text-sm mb-3">
                      Configuration saved — approval needed. Open the link below to approve
                      this app on the Sia indexer, then come back and click "I've approved it".
                    </p>
                    <a
                      href={approvalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
                      style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
                    >
                      Open approval URL <ExternalLink size={14} />
                    </a>
                  </div>

                  <button
                    onClick={handleCheckApproval}
                    disabled={checkingApproval}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-all"
                    style={{ background: 'var(--accent)', color: 'var(--accent-fg)', opacity: checkingApproval ? 0.7 : 1 }}
                  >
                    {checkingApproval ? (
                      <><Loader2 size={16} className="animate-spin" /> Checking...</>
                    ) : (
                      <><Check size={16} /> I've approved it</>
                    )}
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Sia Indexer URL</label>
                    <input
                      type="url"
                      value={siaIndexerUrl}
                      onChange={(e) => setSiaIndexerUrl(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg text-sm"
                      style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
                      placeholder="https://sia.storage"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">Sia App ID</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={siaAppId}
                        onChange={(e) => setSiaAppId(e.target.value)}
                        className="flex-1 px-3 py-2 rounded-lg text-sm font-mono"
                        style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
                        placeholder="64-character hex string"
                      />
                      <button
                        type="button"
                        onClick={() => setSiaAppId(generateAppId())}
                        className="px-3 py-2 rounded-lg text-sm"
                        style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
                      >
                        Generate
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">App Name</label>
                    <input
                      type="text"
                      value={siaAppName}
                      onChange={(e) => setSiaAppName(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg text-sm"
                      style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
                      placeholder="ReBit"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">App Description</label>
                    <input
                      type="text"
                      value={siaAppDescription}
                      onChange={(e) => setSiaAppDescription(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg text-sm"
                      style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
                      placeholder="Decentralized video clipping engine"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">
                      BIP-39 Recovery Phrase
                      <span className="text-xs opacity-50 ml-2">(12 or 24 words — never stored)</span>
                    </label>
                    <textarea
                      value={siaRecoveryPhrase}
                      onChange={(e) => setSiaRecoveryPhrase(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg text-sm font-mono"
                      style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
                      rows={3}
                      placeholder="Enter your 12 or 24 word recovery phrase..."
                    />
                    <p className="text-xs opacity-50 mt-1">
                      Your recovery phrase is used once to derive an App Key, then discarded.
                      It is never stored on disk or in the database.
                    </p>
                  </div>

                  {siaError && (
                    <div className="p-3 rounded-lg text-sm" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: 'var(--danger)' }}>
                      {siaError}
                    </div>
                  )}

                  <button
                    onClick={handleSiaSubmit}
                    disabled={siaLoading || !siaIndexerUrl || !siaAppId || !siaRecoveryPhrase}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-all"
                    style={{
                      background: 'var(--accent)',
                      color: 'var(--accent-fg)',
                      opacity: siaLoading || !siaIndexerUrl || !siaAppId || !siaRecoveryPhrase ? 0.5 : 1,
                    }}
                  >
                    {siaLoading ? (
                      <><Loader2 size={16} className="animate-spin" /> Starting registration...</>
                    ) : (
                      'Start Sia Registration'
                    )}
                  </button>
                </div>
              )}

              {siaConfirmed && (
                <div className="flex justify-end">
                  <button
                    onClick={() => goToStep('openrouter')}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium"
                    style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
                  >
                    Next Step <ChevronRight size={16} />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Step 2: OpenRouter ──────────────────────────────────── */}
          {currentStep === 'openrouter' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold mb-1">OpenRouter API Key</h2>
                <p className="text-sm opacity-60">
                  Enter your OpenRouter API key to enable AI-powered features
                  like transcription, hook detection, and quality analysis.
                </p>
              </div>

              {orConfirmed ? (
                <div className="p-4 rounded-lg" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}>
                  <div className="flex items-center gap-2 text-success">
                    <Check size={20} />
                    <span className="font-medium">OpenRouter API key configured</span>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">OpenRouter API Key</label>
                    <input
                      type="password"
                      value={openrouterKey}
                      onChange={(e) => setOpenrouterKey(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg text-sm font-mono"
                      style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
                      placeholder="sk-or-v1-..."
                    />
                    <p className="text-xs opacity-50 mt-1">
                      Get your key at{' '}
                      <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="underline">
                        openrouter.ai/keys
                      </a>
                    </p>
                  </div>

                  {orError && (
                    <div className="p-3 rounded-lg text-sm" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: 'var(--danger)' }}>
                      {orError}
                    </div>
                  )}

                  <button
                    onClick={handleOrSubmit}
                    disabled={orLoading || !openrouterKey}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-all"
                    style={{
                      background: 'var(--accent)',
                      color: 'var(--accent-fg)',
                      opacity: orLoading || !openrouterKey ? 0.5 : 1,
                    }}
                  >
                    {orLoading ? (
                      <><Loader2 size={16} className="animate-spin" /> Saving...</>
                    ) : (
                      'Save OpenRouter Key'
                    )}
                  </button>
                </div>
              )}

              {orConfirmed && (
                <div className="flex justify-end">
                  <button
                    onClick={() => goToStep('providers')}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium"
                    style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
                  >
                    Next Step <ChevronRight size={16} />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Step 3: Providers ───────────────────────────────────── */}
          {currentStep === 'providers' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold mb-1">Authentication Providers</h2>
                <p className="text-sm opacity-60">
                  Configure social login and passkey authentication.
                  All fields are optional — you can skip this step and configure later.
                </p>
              </div>

              <div className="space-y-4">
                <div className="p-4 rounded-lg" style={{ background: 'rgba(59,130,246,0.05)', border: '1px solid var(--border)' }}>
                  <h3 className="font-medium mb-3">Google OAuth</h3>
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={googleClientId}
                      onChange={(e) => setGoogleClientId(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg text-sm"
                      style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
                      placeholder="Google Client ID"
                    />
                    <input
                      type="password"
                      value={googleClientSecret}
                      onChange={(e) => setGoogleClientSecret(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg text-sm"
                      style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
                      placeholder="Google Client Secret"
                    />
                  </div>
                </div>

                <div className="p-4 rounded-lg" style={{ background: 'rgba(59,130,246,0.05)', border: '1px solid var(--border)' }}>
                  <h3 className="font-medium mb-3">GitHub OAuth</h3>
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={githubClientId}
                      onChange={(e) => setGithubClientId(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg text-sm"
                      style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
                      placeholder="GitHub Client ID"
                    />
                    <input
                      type="password"
                      value={githubClientSecret}
                      onChange={(e) => setGithubClientSecret(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg text-sm"
                      style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
                      placeholder="GitHub Client Secret"
                    />
                  </div>
                </div>

                <div className="p-4 rounded-lg" style={{ background: 'rgba(59,130,246,0.05)', border: '1px solid var(--border)' }}>
                  <h3 className="font-medium mb-3">Passkeys / WebAuthn</h3>
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={webauthnRpId}
                      onChange={(e) => setWebauthnRpId(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg text-sm"
                      style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
                      placeholder="Relying Party ID (e.g., localhost)"
                    />
                    <input
                      type="text"
                      value={webauthnOrigin}
                      onChange={(e) => setWebauthnOrigin(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg text-sm"
                      style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
                      placeholder="Origin (e.g., http://localhost:3000)"
                    />
                  </div>
                </div>
              </div>

              {provError && (
                <div className="p-3 rounded-lg text-sm" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: 'var(--danger)' }}>
                  {provError}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => { setProvConfirmed(true); goToStep('signup'); }}
                  className="flex-1 px-4 py-3 rounded-lg font-medium text-sm"
                  style={{ border: '1px solid var(--border)' }}
                >
                  Skip this step
                </button>
                <button
                  onClick={handleProvSubmit}
                  disabled={provLoading}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium"
                  style={{ background: 'var(--accent)', color: 'var(--accent-fg)', opacity: provLoading ? 0.7 : 1 }}
                >
                  {provLoading ? (
                    <><Loader2 size={16} className="animate-spin" /> Saving...</>
                  ) : (
                    'Save & Continue'
                  )}
                </button>
              </div>
            </div>
          )}

          {/* ── Step 4: Sign Up ─────────────────────────────────────── */}
          {currentStep === 'signup' && (
            <div className="space-y-6 text-center">
              <div className="flex justify-center">
                <div className="p-4 rounded-full" style={{ background: 'rgba(16,185,129,0.1)' }}>
                  <Check size={48} className="text-success" />
                </div>
              </div>

              <div>
                <h2 className="text-xl font-semibold mb-1">Setup Complete!</h2>
                <p className="text-sm opacity-60">
                  Your ReBit instance is configured and ready to go.
                  Click below to create your first account and start using the platform.
                </p>
              </div>

              <div className="space-y-3 text-left">
                <div className="flex items-center gap-3 p-3 rounded-lg" style={{ background: 'rgba(16,185,129,0.05)' }}>
                  <Check size={16} className="text-success shrink-0" />
                  <span className="text-sm">{siaConfirmed ? 'Sia storage connected' : 'Sia in demo mode'}</span>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg" style={{ background: 'rgba(16,185,129,0.05)' }}>
                  <Check size={16} className="text-success shrink-0" />
                  <span className="text-sm">{orConfirmed ? 'OpenRouter API key configured' : 'OpenRouter not configured'}</span>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg" style={{ background: 'rgba(16,185,129,0.05)' }}>
                  <Check size={16} className="text-success shrink-0" />
                  <span className="text-sm">
                    {provConfirmed ? 'Authentication providers configured' : 'Authentication providers skipped (can configure later)'}
                  </span>
                </div>
              </div>

              <button
                onClick={handleCompleteSetup}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium"
                style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
              >
                Create Your Account <UserPlus size={16} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}