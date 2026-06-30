'use client';
import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { startRegistration } from '@simplewebauthn/browser';
import { Check, ChevronRight, Eye, EyeOff, Zap, Server, Key, User, Shield, Fingerprint, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';

const STEPS = [
  { label: 'Sia Indexer', icon: Server, desc: 'Connect to your Sia indexer' },
  { label: 'App Key', icon: Key, desc: 'Derive your storage key' },
  { label: 'Password', icon: Shield, desc: 'Secure your instance' },
  { label: 'Account', icon: User, desc: 'Create the admin user' },
  { label: 'Passkey', icon: Fingerprint, desc: 'Enroll your biometrics' },
];

export default function SetupPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [showPhrase, setShowPhrase] = useState(false);
  const [showPass, setShowPass] = useState(false);

  const [indexerUrl, setIndexerUrl] = useState('');
  const [mnemonic, setMnemonic] = useState('');
  const [appKeyConfirmed, setAppKeyConfirmed] = useState(false);
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');

  // Passkey state
  const [passkeyStatus, setPasskeyStatus] = useState<'idle' | 'enrolling' | 'success' | 'error'>('idle');
  const [passkeyMessage, setPasskeyMessage] = useState('');

  const next = async () => {
    if (step < STEPS.length - 1) {
      // If moving to the passkey step, trigger enrollment automatically
      if (step === STEPS.length - 2) {
        setStep(s => s + 1);
        // Auto-trigger enrollment after a brief moment for the UI to render
        setTimeout(() => handleEnrollPasskey(), 300);
      } else {
        setStep(s => s + 1);
      }
    } else {
      router.push('/upload');
    }
  };

  const canNext = [
    indexerUrl.length > 0 || true, // allow demo mode
    mnemonic.split(' ').length >= 12 || appKeyConfirmed,
    password.length >= 8,
    username.length >= 2,
    passkeyStatus === 'success' || passkeyStatus === 'idle', // optional but encouraged
  ][step];

  const handleEnrollPasskey = useCallback(async () => {
    // Check if WebAuthn is supported
    if (typeof window === 'undefined' || !window.PublicKeyCredential) {
      setPasskeyStatus('idle');
      setPasskeyMessage('Passkeys not supported on this browser. You can skip this step.');
      return;
    }

    setPasskeyStatus('enrolling');
    setPasskeyMessage('');

    try {
      // Step 1: Get registration options (the user must be signed in with the session)
      // Since this is setup, we need a different strategy. We'll generate a temporary
      // registration by first creating the user via an API call
      const beginRes = await fetch('/api/auth/passkey/register/begin');
      if (!beginRes.ok) {
        // If not authorized (no session yet during setup), show a message
        // telling them they can enroll later in Settings
        setPasskeyStatus('idle');
        setPasskeyMessage('You can enroll a passkey later from the Settings page after logging in.');
        return;
      }

      const options = await beginRes.json();

      // Step 2: Trigger the native biometric dialogue (fingerprint / Face ID / Windows Hello)
      const regResponse = await startRegistration(options);

      // Step 3: Send the response back to the server for verification
      const completeRes = await fetch('/api/auth/passkey/register/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(regResponse),
      });

      if (!completeRes.ok) {
        const data = await completeRes.json();
        throw new Error(data.error || 'Registration verification failed.');
      }

      setPasskeyStatus('success');
      setPasskeyMessage('Passkey enrolled successfully! Your fingerprint is now registered.');
    } catch (err: any) {
      if (err.name === 'AbortError' || err.name === 'NotAllowedError') {
        setPasskeyStatus('idle');
        setPasskeyMessage('Passkey enrollment was cancelled. You can enroll later from Settings.');
      } else if (err.message?.includes('Unauthorized')) {
        setPasskeyStatus('idle');
        setPasskeyMessage('You can enroll a passkey later from the Settings page after logging in.');
      } else {
        setPasskeyStatus('error');
        setPasskeyMessage(err.message || 'Enrollment failed. You can try again later from Settings.');
      }
    }
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: 'var(--accent)', boxShadow: '0 0 20px var(--accent-glow)' }}>
            <Zap size={16} color="white" fill="white" />
          </div>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--text-primary)' }}>
            re<span style={{ color: 'var(--accent-bright)' }}>bit</span>
          </span>
        </div>

        <h1 className="text-xl font-semibold text-center mb-1" style={{ color: 'var(--text-primary)', letterSpacing: '-0.025em' }}>
          First-time setup
        </h1>
        <p className="text-sm text-center mb-8" style={{ color: 'var(--text-muted)' }}>
          Get your instance running in 5 steps.
        </p>

        {/* Step indicators */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {STEPS.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-all"
                style={{
                  background: i < step ? 'var(--success)' : i === step ? 'var(--accent)' : 'var(--bg-elevated)',
                  color: i <= step ? 'white' : 'var(--text-muted)',
                  border: `1px solid ${i === step ? 'var(--accent)' : i < step ? 'var(--success)' : 'var(--border)'}`,
                }}>
                {i < step ? <Check size={12} /> : i + 1}
              </div>
              {i < STEPS.length - 1 && (
                <div className="w-8 h-px" style={{ background: i < step ? 'var(--success)' : 'var(--border)' }} />
              )}
            </div>
          ))}
        </div>

        {/* Step card */}
        <div className="rounded-2xl p-6" style={{ border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
          <div className="flex items-center gap-3 mb-6">
            {(() => { const Icon = STEPS[step].icon; return <Icon size={18} style={{ color: 'var(--accent-bright)' }} />; })()}
            <div>
              <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{STEPS[step].label}</h2>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{STEPS[step].desc}</p>
            </div>
          </div>

          {/* Step 0 — Sia Indexer */}
          {step === 0 && (
            <div className="space-y-4">
              <div>
                <label className="text-xs mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Indexer URL</label>
                <input value={indexerUrl} onChange={e => setIndexerUrl(e.target.value)}
                  placeholder="http://localhost:8080"
                  className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                  style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontFamily: 'var(--mono)' }} />
              </div>
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs"
                style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', color: 'var(--warning)' }}>
                Leave blank to start in demo mode — uploads will be simulated.
              </div>
            </div>
          )}

          {/* Step 1 — App Key */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="text-xs mb-1.5 flex items-center justify-between" style={{ color: 'var(--text-secondary)' }}>
                  BIP-39 Recovery Phrase
                  <button onClick={() => setShowPhrase(p => !p)} className="flex items-center gap-1"
                    style={{ color: 'var(--text-muted)' }}>
                    {showPhrase ? <EyeOff size={12} /> : <Eye size={12} />}
                    {showPhrase ? 'Hide' : 'Show'}
                  </button>
                </label>
                <textarea
                  value={mnemonic}
                  onChange={e => setMnemonic(e.target.value)}
                  placeholder="Enter your 12 or 24-word recovery phrase"
                  rows={3}
                  className="w-full px-3 py-2.5 rounded-lg text-sm outline-none resize-none"
                  style={{
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border)',
                    color: showPhrase ? 'var(--text-primary)' : 'transparent',
                    textShadow: showPhrase ? 'none' : '0 0 8px var(--text-primary)',
                    fontFamily: 'var(--mono)',
                  }} />
              </div>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                The App Key is derived from this phrase at runtime. It's never stored in the database.
              </p>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={appKeyConfirmed} onChange={e => setAppKeyConfirmed(e.target.checked)}
                  className="w-4 h-4 rounded" style={{ accentColor: 'var(--accent)' }} />
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  I have saved my recovery phrase in a secure location
                </span>
              </label>
            </div>
          )}

          {/* Step 2 — Password */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <label className="text-xs mb-1.5 flex items-center justify-between" style={{ color: 'var(--text-secondary)' }}>
                  Password
                  <button onClick={() => setShowPass(p => !p)} className="flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                    {showPass ? <EyeOff size={12} /> : <Eye size={12} />}
                  </button>
                </label>
                <input type={showPass ? 'text' : 'password'}
                  value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                  style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
              </div>
              {password.length > 0 && (
                <div className="score-bar">
                  <div className="score-bar-fill" style={{
                    width: `${Math.min(password.length / 16 * 100, 100)}%`,
                    background: password.length < 8 ? 'var(--danger)' : password.length < 12 ? 'var(--warning)' : 'var(--success)',
                  }} />
                </div>
              )}
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Sessions expire after 7 days. Re-authentication required after expiry.
              </p>
            </div>
          )}

          {/* Step 3 — Account */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <label className="text-xs mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Username</label>
                <input value={username} onChange={e => setUsername(e.target.value)}
                  placeholder="admin"
                  className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                  style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontFamily: 'var(--mono)' }} />
              </div>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                This is the first and admin account. Additional accounts can be created later.
              </p>
            </div>
          )}

          {/* Step 4 — Passkey Enrollment */}
          {step === 4 && (
            <div className="space-y-4">
              <div
                className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm"
                style={{
                  background: passkeyStatus === 'success'
                    ? 'rgba(16,185,129,0.1)'
                    : passkeyStatus === 'enrolling'
                      ? 'rgba(59,130,246,0.1)'
                      : passkeyStatus === 'error'
                        ? 'rgba(239,68,68,0.1)'
                        : 'var(--bg-elevated)',
                  border: `1px solid ${
                    passkeyStatus === 'success'
                      ? 'rgba(16,185,129,0.2)'
                      : passkeyStatus === 'enrolling'
                        ? 'rgba(59,130,246,0.2)'
                        : passkeyStatus === 'error'
                          ? 'rgba(239,68,68,0.2)'
                          : 'var(--border)'
                  }`,
                }}
              >
                {passkeyStatus === 'enrolling' ? (
                  <Loader2 size={16} className="animate-spin" style={{ color: 'var(--info)' }} />
                ) : passkeyStatus === 'success' ? (
                  <CheckCircle2 size={16} style={{ color: 'var(--success)' }} />
                ) : (
                  <Fingerprint size={16} style={{ color: 'var(--text-secondary)' }} />
                )}
                <div>
                  <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                    {passkeyStatus === 'enrolling'
                      ? 'Opening biometric dialogue...'
                      : passkeyStatus === 'success'
                        ? 'Passkey enrolled!'
                        : passkeyStatus === 'error'
                          ? 'Enrollment failed'
                          : 'Optional: Enroll your device passkey'}
                  </p>
                  {passkeyMessage && (
                    <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                      {passkeyMessage}
                    </p>
                  )}
                </div>
              </div>

              {passkeyStatus === 'idle' && (
                <button
                  onClick={handleEnrollPasskey}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all"
                  style={{
                    background: 'var(--accent)',
                    color: 'white',
                    boxShadow: '0 0 16px var(--accent-glow)',
                  }}
                >
                  <Fingerprint size={14} />
                  Enroll my fingerprint
                </button>
              )}

              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {passkeyStatus === 'success'
                  ? 'Your fingerprint is now registered. You can sign in with just your biometrics.'
                  : 'This will pop up your device\'s fingerprint, Face ID, or Windows Hello dialogue. You can also do this later in Settings.'}
              </p>
            </div>
          )}

          {/* Next */}
          <button
            onClick={next}
            disabled={!canNext}
            className="mt-6 w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all"
            style={{
              background: canNext ? 'var(--accent)' : 'var(--bg-elevated)',
              color: canNext ? 'white' : 'var(--text-muted)',
              boxShadow: canNext ? '0 0 16px var(--accent-glow)' : 'none',
              cursor: canNext ? 'pointer' : 'not-allowed',
            }}>
            {step === STEPS.length - 1 ? 'Finish setup' : 'Continue'}
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}