import Link from 'next/link';
import Image from 'next/image';
import { auth } from '@/lib/auth/auth';
import {
  Zap,
  Shield,
  ArrowRight,
  UploadCloud,
  Database,
  Mic,
  Sparkles,
  Scissors,
  Smartphone,
  Eye,
  Activity,
  PlayCircle,
  FileText,
} from 'lucide-react';

const PIPELINE_FLOW = [
  { label: 'Upload', icon: <UploadCloud size={16} /> },
  { label: 'Sia Upload', icon: <Database size={16} /> },
  { label: 'Transcribe', icon: <Mic size={16} /> },
  { label: 'Detect', icon: <Sparkles size={16} /> },
  { label: 'Extract', icon: <Scissors size={16} /> },
  { label: 'Render', icon: <Smartphone size={16} /> },
  { label: 'Sia Storage', icon: <Shield size={16} /> },
];

const STAGES = [
  {
    n: '01',
    title: 'Sia Upload',
    body: 'Your source video goes to the Sia Network first, before anything else touches it. That copy becomes the permanent, content-addressed record of the original file.',
  },
  {
    n: '02',
    title: 'Transcription',
    body: 'Whisper runs locally on your own hardware and turns the audio into a full transcript. No file or API key ever leaves your machine for this step.',
  },
  {
    n: '03',
    title: 'Highlight detection',
    body: 'A heuristic engine scores every moment in the transcript for hook strength, virality, and emotion across eight categories. Add an OpenRouter key to sharpens the scoring further.',
  },
  {
    n: '04',
    title: 'Clip extraction',
    body: 'FFmpeg cuts the highest-scoring segments out of the source video, merging nearby moments so each clip has a natural start and end.',
  },
  {
    n: '05',
    title: 'Vertical render',
    body: 'Each clip gets reframed to 9:16. OpenCV looks for a face first, falls back to saliency detection for products or screens, and centers the crop if neither is found.',
  },
  {
    n: '06',
    title: 'Sia Storage',
    body: 'The finished clips, the transcript, and the source video are all written to Sia. Every result is verifiable: anyone can pull the same object ID and check it themselves.',
  },
];

const FEATURES = [
  {
    icon: <Mic size={20} />,
    title: 'Local transcription',
    description: 'Whisper runs on your own hardware. There is no external speech-to-text API and no audio ever leaves your infrastructure.',
  },
  {
    icon: <Sparkles size={20} />,
    title: 'Highlight scoring',
    description: 'A local heuristic engine ranks hook strength and virality, with an optional GPT-4o-mini pass for higher-quality picks.',
  },
  {
    icon: <Eye size={20} />,
    title: 'Smart reframing',
    description: 'Face detection and saliency analysis keep the right subject centered when converting to vertical video.',
  },
  {
    icon: <Shield size={20} />,
    title: 'Sia-backed storage',
    description: 'Clips, transcripts, and source files are stored on Sia: immutable, content-addressed, and checkable by anyone.',
  },
  {
    icon: <Activity size={20} />,
    title: 'Live pipeline status',
    description: 'Every stage streams progress over Server-Sent Events, so you watch each job move in real time instead of guessing.',
  },
  {
    icon: <PlayCircle size={20} />,
    title: 'Demo mode included',
    description: 'No Sia account yet? Rebit falls back to a simulated run with realistic timing, so you can try the full flow first.',
  },
];

export default async function HomePage() {
  // Gracefully handle auth errors — during initial setup the auth secret
  // may not exist in the database yet, so auth() would throw.
  let session = null;
  try {
    session = await auth();
  } catch {
    // Auth not configured yet — treat as unauthenticated
  }

  const isLoggedIn = !!session?.user;

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="max-w-4xl mx-auto px-4 pt-16 sm:pt-24 pb-10 text-center">
        <div className="flex items-center justify-center gap-3 mb-6">
          <div
            className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center"
            style={{ background: 'var(--accent)', boxShadow: '0 0 30px var(--accent-glow)' }}
          >
            <Zap size={22} color="white" fill="white" />
          </div>
          <span
            style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: '1.75rem', color: 'var(--text-primary)' }}
            className="sm:text-[2rem]"
          >
            re<span style={{ color: 'var(--accent-bright)' }}>bit</span>
          </span>
        </div>

        <h1
          className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4 leading-tight"
          style={{ color: 'var(--text-primary)' }}
        >
          Decentralized Video
          <br />
          <span style={{ color: 'var(--accent-bright)' }}>Clipping Engine</span>
        </h1>

        <p
          className="text-base sm:text-lg mb-8 max-w-2xl mx-auto px-2"
          style={{ color: 'var(--text-secondary)' }}
        >
          Upload a video or drop in a direct link. Rebit transcribes it, finds the moments worth
          clipping, reframes them to 9:16, and stores every result on Sia. It runs on your own
          infrastructure, not a subscription.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 px-4 mb-4">
          <Link
            href={isLoggedIn ? '/upload' : '/login'}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-medium text-sm transition-all"
            style={{ background: 'var(--accent)', color: 'white', boxShadow: '0 0 20px var(--accent-glow)' }}
          >
            {isLoggedIn ? 'Upload a Video' : 'Get Started'}
            <ArrowRight size={16} />
          </Link>
          <Link
            href={isLoggedIn ? '/projects' : '/login'}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-medium text-sm transition-all"
            style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
          >
            {isLoggedIn ? 'My Projects' : 'Sign In'}
          </Link>
        </div>

        <Link
          href="/whitepaper"
          className="inline-flex items-center gap-1.5 text-sm transition-all hover:opacity-80"
          style={{ color: 'var(--text-secondary)' }}
        >
          <FileText size={14} />
          Read the whitepaper
        </Link>
      </section>

      {/* Pipeline flow strip */}
      <section className="max-w-5xl mx-auto px-4 pb-16 sm:pb-20">
        <div
          className="rounded-xl border p-4 sm:p-6 overflow-x-auto"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
        >
          <div className="flex items-center gap-2 sm:gap-3 min-w-max mx-auto justify-center">
            {PIPELINE_FLOW.map((stage, i) => (
              <div key={stage.label} className="flex items-center gap-2 sm:gap-3">
                <div className="flex flex-col items-center gap-2">
                  <div
                    className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center"
                    style={{ background: 'rgba(124,58,237,0.1)', color: 'var(--accent-bright)' }}
                  >
                    {stage.icon}
                  </div>
                  <span
                    className="text-[11px] sm:text-xs whitespace-nowrap"
                    style={{ color: 'var(--text-secondary)', fontFamily: 'var(--mono)' }}
                  >
                    {stage.label}
                  </span>
                </div>
                {i < PIPELINE_FLOW.length - 1 && (
                  <ArrowRight size={14} style={{ color: 'var(--text-muted)' }} className="mb-5" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-4xl mx-auto px-4 py-12 sm:py-16">
        <h2 className="text-2xl sm:text-3xl font-bold mb-2 text-center" style={{ color: 'var(--text-primary)' }}>
          Six stages, start to finish
        </h2>
        <p className="text-sm sm:text-base mb-10 text-center max-w-xl mx-auto" style={{ color: 'var(--text-secondary)' }}>
          Every job moves through the same pipeline in order. Progress reports as it goes, and a
          failed stage tells you exactly what went wrong.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
          {STAGES.map((stage) => (
            <div
              key={stage.n}
              className="p-5 rounded-xl border flex gap-4"
              style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
            >
              <span
                className="text-sm font-semibold shrink-0"
                style={{ color: 'var(--accent-bright)', fontFamily: 'var(--mono)' }}
              >
                {stage.n}
              </span>
              <div>
                <h3 className="font-semibold mb-1.5" style={{ color: 'var(--text-primary)' }}>
                  {stage.title}
                </h3>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  {stage.body}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Screenshot: highlight scoring */}
      <section className="max-w-5xl mx-auto px-4 py-12 sm:py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 sm:gap-10 items-center">
          <div className="order-2 md:order-1">
            <span
              className="text-xs font-semibold tracking-wide uppercase"
              style={{ color: 'var(--accent-bright)', fontFamily: 'var(--mono)' }}
            >
              Clip review
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold mt-2 mb-4" style={{ color: 'var(--text-primary)' }}>
              You see why a clip was chosen
            </h2>
            <p className="text-sm sm:text-base leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              Each candidate clip shows its score, its hook strength, and the emotional signal that
              got it selected, urgency, contrast, curiosity, and more. Approve the ones worth
              keeping and reject the rest before anything gets rendered.
            </p>
          </div>
          <div className="order-1 md:order-2">
            <div
              className="rounded-xl border overflow-hidden relative aspect-[16/10]"
              style={{ borderColor: 'var(--border)', boxShadow: '0 0 40px rgba(0,0,0,0.4)' }}
            >
              <Image
                src="/screenshots/clip-review-cropped.png"
                alt="Rebit clip review screen showing four candidate clips with hook and score labels"
                fill
                sizes="(max-width: 768px) 100vw, 50vw"
                className="object-cover object-top"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-4 py-12 sm:py-16">
        <h2 className="text-2xl sm:text-3xl font-bold mb-10 text-center" style={{ color: 'var(--text-primary)' }}>
          Built to run on your own terms
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
          {FEATURES.map((feature) => (
            <FeatureCard key={feature.title} {...feature} />
          ))}
        </div>
      </section>

      {/* Screenshot: pipeline transparency */}
      <section className="max-w-5xl mx-auto px-4 py-12 sm:py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 sm:gap-10 items-center">
          <div>
            <div
              className="rounded-xl border overflow-hidden relative aspect-[16/11]"
              style={{ borderColor: 'var(--border)', boxShadow: '0 0 40px rgba(0,0,0,0.4)' }}
            >
              <Image
                src="/screenshots/pipeline-processing-cropped.png"
                alt="Rebit pipeline detail screen showing all six stages complete with Sia upload logs"
                fill
                sizes="(max-width: 768px) 100vw, 50vw"
                className="object-cover object-top"
              />
            </div>
          </div>
          <div>
            <span
              className="text-xs font-semibold tracking-wide uppercase"
              style={{ color: 'var(--accent-bright)', fontFamily: 'var(--mono)' }}
            >
              Full visibility
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold mt-2 mb-4" style={{ color: 'var(--text-primary)' }}>
              Nothing runs as a black box
            </h2>
            <p className="text-sm sm:text-base leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              Every stage reports its own timing, and the Sia log shows the exact object ID for
              every file it stores. If a stage fails, it says which one and why, instead of leaving
              you to guess.
            </p>
          </div>
        </div>
      </section>

      {/* Stack strip */}
      <section className="max-w-4xl mx-auto px-4 py-12 sm:py-16 text-center">
        <h2 className="text-sm font-semibold tracking-wide uppercase mb-6" style={{ color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>
          Under the hood
        </h2>
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
          {['Next.js', 'FastAPI', 'Whisper', 'FFmpeg', 'OpenCV', 'PostgreSQL', 'Sia Network'].map((tech) => (
            <span
              key={tech}
              className="text-sm"
              style={{ color: 'var(--text-secondary)', fontFamily: 'var(--mono)' }}
            >
              {tech}
            </span>
          ))}
        </div>
      </section>

      {/* Closing CTA */}
      <section className="max-w-3xl mx-auto px-4 py-12 sm:py-16 text-center">
        <h2 className="text-xl sm:text-2xl font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
          Run your own clipping pipeline
        </h2>
        <p className="text-sm sm:text-base mb-6" style={{ color: 'var(--text-secondary)' }}>
          Self-hosted, Sia-backed, and open to inspection at every stage.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href={isLoggedIn ? '/upload' : '/login'}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-medium text-sm transition-all"
            style={{ background: 'var(--accent)', color: 'white', boxShadow: '0 0 20px var(--accent-glow)' }}
          >
            {isLoggedIn ? 'Upload a Video' : 'Get Started'}
            <ArrowRight size={16} />
          </Link>
          <Link
            href="/whitepaper"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-medium text-sm transition-all"
            style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
          >
            Read the whitepaper
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="text-center py-8 px-4">
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
      className="p-5 sm:p-6 rounded-xl border transition-all"
      style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
    >
      <div
        className="w-10 h-10 rounded-lg flex items-center justify-center mb-4"
        style={{ background: 'rgba(124,58,237,0.1)', color: 'var(--accent-bright)' }}
      >
        {icon}
      </div>
      <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
        {title}
      </h3>
      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
        {description}
      </p>
    </div>
  );
}