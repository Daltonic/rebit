import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, ArrowRight } from 'lucide-react';

export const metadata: Metadata = {
    title: 'Whitepaper — Rebit',
    description: 'How Rebit turns long-form video into clips, why it stores everything on Sia, and where the project is headed.',
};

const PIPELINE_TABLE = [
    { n: '0', stage: 'Sia Upload', detail: 'Uploads the source video to Sia so an immutable copy of the original exists before any processing starts.' },
    { n: '1', stage: 'Transcription', detail: 'Extracts the audio and runs it through Whisper locally, producing a VTT and JSON transcript.' },
    { n: '2', stage: 'Highlight detection', detail: 'Scores every transcript segment for hook strength and virality using a heuristic engine, with an optional LLM pass through OpenRouter.' },
    { n: '3', stage: 'Clip extraction', detail: 'Cuts the highest-scoring segments out of the source video with FFmpeg.' },
    { n: '4', stage: 'Vertical render', detail: 'Converts each clip to 9:16 using face detection, then saliency detection, then a center crop as a last resort.' },
    { n: '5', stage: 'Sia Storage', detail: 'Uploads the transcript, the clips, and the source video to Sia as the permanent record of the job.' },
];

const EMOTIONAL_SIGNALS = [
    'Excitement', 'Surprise', 'Urgency', 'Curiosity', 'Authority', 'Positivity', 'Negativity', 'Contrast',
];

const STACK_TABLE = [
    { layer: 'Frontend', tech: 'Next.js 16, TypeScript, TailwindCSS v4, NextAuth.js v5' },
    { layer: 'Backend', tech: 'Python (FastAPI), SQLAlchemy (async), PostgreSQL' },
    { layer: 'Orchestration', tech: 'Async Python with a per-job lock, one background task per pipeline run' },
    { layer: 'Transcription', tech: 'Whisper, run locally' },
    { layer: 'Highlight analysis', tech: 'A heuristic scoring engine, with optional GPT-4o-mini enhancement via OpenRouter' },
    { layer: 'Video processing', tech: 'FFmpeg, run as an async subprocess' },
    { layer: 'Subject tracking', tech: 'OpenCV, using Haar cascade face detection and saliency detection' },
    { layer: 'Storage', tech: 'Sia Network' },
    { layer: 'Real-time updates', tech: 'Server-Sent Events over asyncio queues' },
];

export default function WhitepaperPage() {
    return (
        <div className="min-h-screen">
            <div className="max-w-3xl mx-auto px-4 pt-10 sm:pt-14">
                <Link
                    href="/"
                    className="inline-flex items-center gap-1.5 text-sm mb-8 transition-all hover:opacity-80"
                    style={{ color: 'var(--text-secondary)' }}
                >
                    <ArrowLeft size={14} />
                    Back home
                </Link>

                <span
                    className="text-xs font-semibold tracking-wide uppercase ml-3"
                    style={{ color: 'var(--accent-bright)', fontFamily: 'var(--mono)' }}
                >
                    Whitepaper
                </span>
                <h1 className="text-3xl sm:text-4xl font-bold mt-2 mb-4" style={{ color: 'var(--text-primary)' }}>
                    What Rebit is and where it is going
                </h1>
                <p className="text-base sm:text-lg leading-relaxed mb-14" style={{ color: 'var(--text-secondary)' }}>
                    Rebit turns a single long-form video into a set of short, vertical clips, and it does the
                    whole job on infrastructure you control. This document covers how the pipeline works, why
                    Sia sits underneath it, and what is left to build before launch.
                </p>
            </div>

            {/* Overview */}
            <Section title="The problem it solves">
                <p>
                    Turning a long video into short clips usually means picking a cloud editing tool, uploading
                    your footage to someone else&apos;s servers, and paying per minute processed. Rebit takes a
                    different position: the entire pipeline, transcription, highlight detection, cutting, and
                    reframing, runs on infrastructure you own. The only outside dependency is Sia, and even that
                    is a decentralized storage network rather than a single company&apos;s cloud.
                </p>
                <p>
                    The result is a video moves from upload to a set of ranked, ready-to-review vertical clips
                    without your source footage ever leaving your own machine except to reach Sia, and without a
                    subscription fee attached to the process.
                </p>
            </Section>

            {/* Pipeline */}
            <Section title="The pipeline">
                <p>
                    Every job runs through the same six stages, in the same order, every time. A per-job lock
                    stops a job from running twice at once, and each stage has its own timeout, so a stuck stage
                    fails cleanly instead of hanging the whole job.
                </p>
                <div className="my-8 space-y-3">
                    {PIPELINE_TABLE.map((row) => (
                        <div key={row.n} className="flex gap-4 p-4 rounded-lg border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
                            <span className="text-sm font-semibold shrink-0" style={{ color: 'var(--accent-bright)', fontFamily: 'var(--mono)' }}>
                                {row.n}
                            </span>
                            <div>
                                <p className="font-semibold text-sm mb-1" style={{ color: 'var(--text-primary)' }}>{row.stage}</p>
                                <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{row.detail}</p>
                            </div>
                        </div>
                    ))}
                </div>
                <ScreenshotFigure
                    src="/screenshots/pipeline-processing-cropped.png"
                    alt="Rebit pipeline detail view showing all six stages marked complete, alongside Sia upload logs and object IDs"
                    caption="A completed run. Each stage reports its own duration, and the Sia log lists the object ID for every file it stored."
                />
            </Section>

            {/* Highlight detection */}
            <Section title="How a clip gets chosen">
                <p>
                    Stage two reads the transcript and scores every segment before a single frame gets cut. A
                    heuristic engine looks at hook strength, how strong the opening line of a segment is, and a
                    virality score built from position, duration, and sentence structure. It also checks each
                    segment against eight emotional signals:
                </p>
                <div className="flex flex-wrap gap-2 my-6">
                    {EMOTIONAL_SIGNALS.map((signal) => (
                        <span
                            key={signal}
                            className="text-xs px-3 py-1.5 rounded-full border"
                            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)', fontFamily: 'var(--mono)' }}
                        >
                            {signal}
                        </span>
                    ))}
                </div>
                <p>
                    This scoring runs entirely locally and needs no API key. If you add an OpenRouter key, Rebit
                    adds a GPT-4o-mini pass on top of the heuristic score for sharper picks. Either way, nearby
                    segments get merged into natural boundaries, and the top-scoring segments become your clips,
                    shown to you with their scores before anything renders.
                </p>
                <ScreenshotFigure
                    src="/screenshots/clip-review-cropped.png"
                    alt="Rebit clip review screen showing four candidate clips, each with a numeric score, hook strength, and emotional signal label"
                    caption="Clip review. Each candidate shows its score, hook strength, and the signal that got it selected, so you can approve or reject before rendering."
                />
            </Section>

            {/* Vertical render */}
            <Section title="Reframing for vertical">
                <p>
                    Converting a widescreen clip to 9:16 means deciding what to keep in frame. Rebit tries three
                    approaches in order: face detection first, using OpenCV&apos;s Haar cascade to find the
                    largest face in a sampled set of frames; saliency detection second, for clips without a
                    face, such as product shots or screen recordings; and a center crop as the fallback if
                    neither approach finds a clear subject.
                </p>
            </Section>

            {/* Trust model */}
            <Section title="Why Sia">
                <p>
                    Every clip, transcript, and source video gets uploaded to Sia as a content-addressed object.
                    That means the result is not just backed up, it is verifiable: anyone with the object ID can
                    fetch the exact same file from the network and confirm it matches. If Sia is not configured
                    yet, Rebit falls back to a demo mode that simulates the same pipeline with realistic timing,
                    so you can try the full flow before connecting real storage.
                </p>
            </Section>

            {/* Stack */}
            <Section title="Architecture">
                <div className="my-6 rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
                    {STACK_TABLE.map((row, i) => (
                        <div
                            key={row.layer}
                            className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 px-4 py-3"
                            style={{
                                background: i % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-elevated)',
                                borderTop: i === 0 ? 'none' : '1px solid var(--border-subtle)',
                            }}
                        >
                            <span className="text-sm font-semibold sm:w-40 shrink-0" style={{ color: 'var(--text-primary)' }}>
                                {row.layer}
                            </span>
                            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{row.tech}</span>
                        </div>
                    ))}
                </div>
            </Section>

            {/* Roadmap */}
            <Section title="Roadmap to launch">
                <p>
                    Rebit works today, but a set of workstreams remain before it is ready for a general launch.
                    The target is a four month build window, organized into three groups.
                </p>

                <RoadmapGroup
                    title="Creative range"
                    items={[
                        'Trailer extraction, for a single condensed cut rather than several short clips',
                        'Key moment extraction, refining how segments get picked out of longer footage',
                        'Sound effect integration, layered onto clips automatically',
                        'Subtitle generation, overlay, and multilingual translation',
                        'Background music integration',
                    ]}
                />
                <RoadmapGroup
                    title="Scale and reliability"
                    items={[
                        'Scalability and resilience work across the pipeline',
                        'Multi-threaded and concurrent background processing, so more than one job can run at once without contention',
                        'An efficient chunking strategy for long-form video, so processing time and memory use scale with content rather than file length',
                        'AI model optimization for speed, output quality, highlight accuracy, object tracking, agent-driven workflows, and resource use',
                    ]}
                />
                <RoadmapGroup
                    title="Product and operations"
                    items={[
                        'UI and usability improvements across the dashboard',
                        'Self-hosting and production environment optimization, so a deployment holds up under real usage',
                    ]}
                />
            </Section>

            {/* Future vision */}
            <Section title="Beyond launch">
                <p>
                    The long-term direction is a dedicated <strong style={{ color: 'var(--text-primary)' }}>Studio</strong>{' '}
                    workspace, where a clip can be finished rather than just generated. That means adding
                    background music, generating and overlaying subtitles in multiple languages, and running
                    further post-processing, all before export. Every asset the Studio produces gets stored on
                    Sia the same way the core pipeline stores its output today.
                </p>
                <p>
                    Alongside that, an <strong style={{ color: 'var(--text-primary)' }}>Edit with Editor</strong>{' '}
                    mode is planned for after launch: a manual editing interface for trimming, adjusting, and
                    fine-tuning a generated clip by hand. It sits next to the automated pipeline rather than
                    replacing it, for the moments when a person wants direct control over the final cut.
                </p>
                <p>
                    Further out, the plan extends past video: multi-language transcription, batch processing for
                    queuing several videos at once, custom render templates, engagement analytics, direct social
                    sharing, webhooks for pipeline events, and programmatic API access. Each of these is meant to
                    build on the pipeline and Sia storage that already exist, not replace them.
                </p>
            </Section>

            <div className="max-w-3xl mx-auto px-4 py-16 text-center border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
                    Every result Rebit produces is reproducible and checkable. Anyone can run the same pipeline
                    and verify the output for themselves.
                </p>
                <Link
                    href="/login"
                    className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-medium text-sm transition-all"
                    style={{ background: 'var(--accent)', color: 'white', boxShadow: '0 0 20px var(--accent-glow)' }}
                >
                    Get Started
                    <ArrowRight size={16} />
                </Link>
            </div>

            <footer className="text-center py-8 px-4">
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    ReBit &mdash; Decentralized Video Clipping Engine
                </p>
            </footer>
        </div>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="max-w-3xl mx-auto px-4 py-10 sm:py-12 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
            <h2 className="text-xl sm:text-2xl font-bold mb-5" style={{ color: 'var(--text-primary)' }}>
                {title}
            </h2>
            <div className="space-y-4 text-sm sm:text-base leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                {children}
            </div>
        </section>
    );
}

function RoadmapGroup({ title, items }: { title: string; items: string[] }) {
    return (
        <div className="mt-6">
            <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)', fontFamily: 'var(--mono)' }}>
                {title}
            </p>
            <ul className="space-y-2.5">
                {items.map((item) => (
                    <li key={item} className="flex gap-3 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                        <span className="shrink-0" style={{ color: 'var(--accent-bright)' }}>&bull;</span>
                        <span>{item}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

function ScreenshotFigure({ src, alt, caption }: { src: string; alt: string; caption: string }) {
    return (
        <figure className="my-8">
            <div
                className="rounded-xl border overflow-hidden relative aspect-[16/10]"
                style={{ borderColor: 'var(--border)', boxShadow: '0 0 40px rgba(0,0,0,0.4)' }}
            >
                <Image src={src} alt={alt} fill className="object-cover object-top" />
            </div>
            <figcaption className="text-xs mt-3" style={{ color: 'var(--text-muted)' }}>
                {caption}
            </figcaption>
        </figure>
    );
}