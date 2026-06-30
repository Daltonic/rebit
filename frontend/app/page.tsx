import Link from 'next/link';
import { Zap, Shield, Video, Server, ArrowRight } from 'lucide-react';

export default function HomePage() {
  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="max-w-4xl mx-auto px-4 pt-24 pb-16 text-center">
        <div className="flex items-center justify-center gap-3 mb-6">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center"
            style={{
              background: 'var(--accent)',
              boxShadow: '0 0 30px var(--accent-glow)',
            }}
          >
            <Zap size={24} color="white" fill="white" />
          </div>
          <span
            style={{
              fontFamily: 'var(--mono)',
              fontWeight: 700,
              fontSize: '2rem',
              color: 'var(--text-primary)',
            }}
          >
            re<span style={{ color: 'var(--accent-bright)' }}>bit</span>
          </span>
        </div>

        <h1
          className="text-4xl md:text-5xl font-bold mb-4 leading-tight"
          style={{ color: 'var(--text-primary)' }}
        >
          Decentralized Video
          <br />
          <span style={{ color: 'var(--accent-bright)' }}>Clipping Engine</span>
        </h1>

        <p
          className="text-lg mb-8 max-w-2xl mx-auto"
          style={{ color: 'var(--text-secondary)' }}
        >
          Turn long-form video into short-form vertical clips. Fully self-hosted,
          stored on Sia decentralized storage.
        </p>

        <div className="flex items-center justify-center gap-4">
          <Link
            href="/login"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg font-medium text-sm transition-all"
            style={{
              background: 'var(--accent)',
              color: 'white',
              boxShadow: '0 0 20px var(--accent-glow)',
            }}
          >
            Get Started
            <ArrowRight size={16} />
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg font-medium text-sm transition-all"
            style={{
              background: 'var(--bg-elevated)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border)',
            }}
          >
            Sign In
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-4xl mx-auto px-4 py-16">
        <div className="grid md:grid-cols-3 gap-6">
          <FeatureCard
            icon={<Video size={20} />}
            title="AI-Powered Clipping"
            description="Automatic highlight detection using AI to find the most engaging moments in your video."
          />
          <FeatureCard
            icon={<Shield size={20} />}
            title="Self-Hosted & Private"
            description="Your data stays on your infrastructure. No third-party cloud dependencies."
          />
          <FeatureCard
            icon={<Server size={20} />}
            title="Sia Storage"
            description="Clips are stored on the Sia decentralized network for redundancy and low cost."
          />
        </div>
      </section>

      {/* Footer */}
      <footer className="text-center py-8">
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          ReBit &mdash; Decentralized Video Clipping Engine
        </p>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div
      className="p-6 rounded-xl border transition-all"
      style={{
        background: 'var(--bg-card)',
        borderColor: 'var(--border)',
      }}
    >
      <div
        className="w-10 h-10 rounded-lg flex items-center justify-center mb-4"
        style={{
          background: 'rgba(124,58,237,0.1)',
          color: 'var(--accent-bright)',
        }}
      >
        {icon}
      </div>
      <h3
        className="font-semibold mb-2"
        style={{ color: 'var(--text-primary)' }}
      >
        {title}
      </h3>
      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
        {description}
      </p>
    </div>
  );
}