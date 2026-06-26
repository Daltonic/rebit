'use client';
import { useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, Video, AlertCircle, CheckCircle2, Loader2, File } from 'lucide-react';

const ACCEPTED = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska'];
const ACCEPTED_EXT = ['.mp4', '.mov', '.webm', '.mkv'];
const MAX_BYTES = 5 * 1024 * 1024 * 1024; // 5 GB

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  return `${(b / 1024 ** 3).toFixed(2)} GB`;
}

export default function UploadPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const validate = (f: File): string | null => {
    if (!ACCEPTED.includes(f.type) && !ACCEPTED_EXT.some(ext => f.name.toLowerCase().endsWith(ext))) {
      return `Unsupported format. Accepted: ${ACCEPTED_EXT.join(', ')}`;
    }
    if (f.size > MAX_BYTES) return `File too large. Maximum is 5 GB (${formatBytes(f.size)} given).`;
    return null;
  };

  const pick = (f: File) => {
    const err = validate(f);
    if (err) { setError(err); setFile(null); return; }
    setError(null);
    setFile(f);
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) pick(f);
  }, []);

  const simulateUpload = async () => {
    setUploading(true);
    // Simulate progress
    for (let i = 0; i <= 100; i += 5) {
      await new Promise(r => setTimeout(r, 80));
      setProgress(i);
    }
    // In production: POST to /api/jobs with FormData, get back job.id
    // Then redirect to /projects/[id]
    router.push('/projects/job_01jx4k2m');
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold mb-2" style={{ color: 'var(--text-primary)', letterSpacing: '-0.03em' }}>
            Upload a video
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            MP4, MOV, WebM, or MKV · Up to 5 GB · 2 hours max
          </p>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => !file && inputRef.current?.click()}
          className="rounded-2xl transition-all duration-200 cursor-pointer"
          style={{
            border: `2px dashed ${dragging ? 'var(--accent-bright)' : file ? 'var(--success)' : 'var(--border)'}`,
            background: dragging ? 'var(--accent-glow)' : 'var(--bg-card)',
            padding: file ? '24px' : '56px 24px',
          }}>

          {!file ? (
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                style={{ background: dragging ? 'var(--accent-glow)' : 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                <Upload size={22} style={{ color: dragging ? 'var(--accent-bright)' : 'var(--text-muted)' }} />
              </div>
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  Drop your video here
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  or click to browse
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)' }}>
                <Video size={18} style={{ color: 'var(--success)' }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{file.name}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>
                  {formatBytes(file.size)}
                </p>
              </div>
              <CheckCircle2 size={18} style={{ color: 'var(--success)', flexShrink: 0 }} />
            </div>
          )}

          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_EXT.join(',')}
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) pick(f); }}
          />
        </div>

        {/* Error */}
        {error && (
          <div className="mt-3 flex items-start gap-2 px-4 py-3 rounded-lg text-sm"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: 'var(--danger)' }}>
            <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Upload progress */}
        {uploading && (
          <div className="mt-4">
            <div className="flex justify-between text-xs mb-1.5" style={{ color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>
              <span>Uploading…</span>
              <span>{progress}%</span>
            </div>
            <div className="score-bar">
              <div className="score-bar-fill" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="mt-6 flex gap-3">
          {file && !uploading && (
            <button onClick={() => { setFile(null); setError(null); }}
              className="flex-shrink-0 px-4 py-2.5 rounded-lg text-sm transition-colors"
              style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
              Clear
            </button>
          )}
          <button
            onClick={file && !uploading ? simulateUpload : () => inputRef.current?.click()}
            disabled={uploading}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all"
            style={{
              background: file ? 'var(--accent)' : 'var(--bg-elevated)',
              color: file ? 'white' : 'var(--text-muted)',
              boxShadow: file ? '0 0 20px var(--accent-glow)' : 'none',
              cursor: uploading ? 'not-allowed' : 'pointer',
              opacity: uploading ? 0.7 : 1,
            }}>
            {uploading
              ? <><Loader2 size={14} className="animate-spin" /> Starting pipeline…</>
              : file
              ? <><Upload size={14} /> Start processing</>
              : <><File size={14} /> Choose a file</>
            }
          </button>
        </div>

        {/* Format hints */}
        <div className="mt-6 grid grid-cols-2 gap-3">
          {[
            { label: 'Transcription', desc: 'Whisper v3 — runs locally' },
            { label: 'Highlight AI', desc: 'Ollama — no API key needed' },
            { label: 'Output format', desc: '9:16 MP4 with captions' },
            { label: 'Storage', desc: 'Sia Network — you own the keys' },
          ].map(({ label, desc }) => (
            <div key={label} className="px-4 py-3 rounded-lg"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{label}</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
