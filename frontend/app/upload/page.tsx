'use client';
import { useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, Video, AlertCircle, CheckCircle2, Loader2, File } from 'lucide-react';

const ACCEPTED = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska'];
const ACCEPTED_EXT = ['.mp4', '.mov', '.webm', '.mkv'];
const MAX_BYTES = 5 * 1024 * 1024 * 1024; // 5 GB
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';

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
  const [statusMessage, setStatusMessage] = useState('');

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

  const uploadToBackend = async () => {
    if (!file) return;

    setUploading(true);
    setProgress(0);
    setStatusMessage('Uploading to server...');

    try {
      // Step 1: Upload the file to the backend
      const formData = new FormData();
      formData.append('file', file);

      const xhr = new XMLHttpRequest();

      // Track upload progress
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 30); // 0-30% for upload
          setProgress(pct);
          setStatusMessage(`Uploading to server... ${formatBytes(e.loaded)} / ${formatBytes(e.total)}`);
        }
      });

      const uploadPromise = new Promise<{ jobId: string; siaObjectId: string; siaStatus: string; status: string }>((resolve, reject) => {
        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(JSON.parse(xhr.responseText));
          } else {
            try {
              const err = JSON.parse(xhr.responseText);
              reject(new Error(err.detail || 'Upload failed'));
            } catch {
              reject(new Error(`Upload failed with status ${xhr.status}`));
            }
          }
        });
        xhr.addEventListener('error', () => reject(new Error('Network error during upload')));
        xhr.addEventListener('abort', () => reject(new Error('Upload aborted')));
      });

      xhr.open('POST', `${BACKEND_URL}/api/upload`);
      xhr.send(formData);

      const result = await uploadPromise;
      const { jobId, siaObjectId, siaStatus } = result;

      setProgress(35);
      setStatusMessage('Video stored on Sia Network! Starting pipeline...');

      // Step 2: Start the pipeline (if Inngest didn't auto-trigger)
      try {
        const pipelineRes = await fetch(`${BACKEND_URL}/api/jobs/${jobId}/start-pipeline`);
        if (!pipelineRes.ok) {
          console.warn('Pipeline start returned non-OK, pipeline may still run via Inngest');
        }
      } catch (e) {
        console.warn('Could not start pipeline via backend, Inngest may handle it:', e);
      }

      setProgress(50);
      setStatusMessage('Pipeline started! Redirecting to project...');

      // Step 3: Redirect to the project page
      // Small delay so the user sees the "Pipeline started" message
      await new Promise(r => setTimeout(r, 500));
      router.push(`/projects/${jobId}`);

    } catch (err: any) {
      setError(err.message || 'Upload failed. Please try again.');
      setUploading(false);
      setProgress(0);
      setStatusMessage('');
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-10 sm:py-12">
      <div className="w-full max-w-xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-xl sm:text-2xl font-semibold mb-2" style={{ color: 'var(--text-primary)', letterSpacing: '-0.03em' }}>
            Upload a video
          </h1>
          <p className="text-sm px-2" style={{ color: 'var(--text-secondary)' }}>
            MP4, MOV, WebM, or MKV · Up to 5 GB · 2 hours max
          </p>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => !file && !uploading && inputRef.current?.click()}
          className="rounded-2xl transition-all duration-200 cursor-pointer"
          style={{
            border: `2px dashed ${dragging ? 'var(--accent-bright)' : file ? 'var(--success)' : 'var(--border)'}`,
            background: dragging ? 'var(--accent-glow)' : 'var(--bg-card)',
            padding: file ? '20px' : '40px 20px',
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
                  or tap to browse
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
            disabled={uploading}
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
              <span>{statusMessage || 'Uploading…'}</span>
              <span>{progress}%</span>
            </div>
            <div className="score-bar">
              <div className="score-bar-fill" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="mt-6 flex flex-col sm:flex-row gap-3">
          <button
            onClick={file && !uploading ? uploadToBackend : () => inputRef.current?.click()}
            disabled={uploading}
            className="order-2 sm:order-1 flex-1 flex items-center justify-center gap-2 py-3 sm:py-2.5 rounded-lg text-sm font-semibold transition-all"
            style={{
              background: file ? 'var(--accent)' : 'var(--bg-elevated)',
              color: file ? 'white' : 'var(--text-muted)',
              boxShadow: file ? '0 0 20px var(--accent-glow)' : 'none',
              cursor: uploading ? 'not-allowed' : 'pointer',
              opacity: uploading ? 0.7 : 1,
            }}>
            {uploading
              ? <><Loader2 size={14} className="animate-spin" /> {progress < 35 ? 'Uploading to Sia…' : 'Starting pipeline…'}</>
              : file
              ? <><Upload size={14} /> Start processing</>
              : <><File size={14} /> Choose a file</>
            }
          </button>
          {file && !uploading && (
            <button onClick={() => { setFile(null); setError(null); }}
              className="order-1 sm:order-2 flex-shrink-0 px-4 py-3 sm:py-2.5 rounded-lg text-sm transition-colors"
              style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
              Clear
            </button>
          )}
        </div>

        {/* Format hints */}
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { label: 'Sia Storage', desc: 'Video stored on Sia Network first' },
            { label: 'Transcription', desc: 'Whisper v3 — runs locally' },
            { label: 'Highlight AI', desc: 'Detects engaging moments' },
            { label: 'Output format', desc: '9:16 MP4 with captions' },
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