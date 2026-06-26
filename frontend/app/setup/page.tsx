'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ChevronRight, Eye, EyeOff, Zap, Server, Key, User, Shield } from 'lucide-react';

const STEPS = [
  { label: 'Sia Indexer', icon: Server, desc: 'Connect to your Sia indexer' },
  { label: 'App Key', icon: Key, desc: 'Derive your storage key' },
  { label: 'Password', icon: Shield, desc: 'Secure your instance' },
  { label: 'Account', icon: User, desc: 'Create the admin user' },
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

  const next = () => {
    if (step < STEPS.length - 1) setStep(s => s + 1);
    else router.push('/upload');
  };

  const canNext = [
    indexerUrl.length > 0 || true, // allow demo mode
    mnemonic.split(' ').length >= 12 || appKeyConfirmed,
    password.length >= 8,
    username.length >= 2,
  ][step];

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
          Get your instance running in 4 steps.
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
