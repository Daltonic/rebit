'use client';
import { useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, Video, AlertCircle, AlertTriangle, CheckCircle2, Loader2, File, Link, Globe } from 'lucide-react';

const ACCEPTED = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska'];
const ACCEPTED_EXT = ['.mp4', '.mov', '.webm', '.mkv'];
const MAX_BYTES = 5 * 1024 * 1024 * 1024; // 5 GB
// Use relative API routes so requests go through Next.js (avoids CORS and timeout issues)
const API_BASE = '';

type ImportMode = 'file' | 'url';

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  return `${(b / 1024 ** 3).toFixed(2)} GB`;
}

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

interface UrlVideoInfo {
  title: string;
  durationSeconds: number | null;
  uploader: string | null;
  thumbnail: string | null;
  webpageUrl: string;
  isValid: boolean;
  warning?: string | null;
}

export default function UploadPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);

  // Tab mode
  const [mode, setMode] = useState<ImportMode>('file');

  // File upload state
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  // URL import state
  const [url, setUrl] = useState('');
  const [urlInfo, setUrlInfo] = useState<UrlVideoInfo | null>(null);
  const [fetchingInfo, setFetchingInfo] = useState(false);

  // Common state
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');

  // ── File Validation ────────────────────────────────────────────────

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

  // ── URL Validation & Info ───────────────────────────────────────────

  const isValidUrl = (u: string): boolean => {
    try {
      const parsed = new URL(u);
      return ['http:', 'https:'].includes(parsed.protocol);
    } catch {
      return false;
    }
  };

  const fetchUrlInfo = async () => {
    if (!url.trim() || !isValidUrl(url.trim())) {
      setError('Please enter a valid media URL (e.g., https://example.com/video.mp4)');
      return;
    }

    setFetchingInfo(true);
    setError(null);
    setUrlInfo(null);

    try {
      const res = await fetch('/api/url-import/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Could not fetch video info');
      }

      const info: UrlVideoInfo = await res.json();
      setUrlInfo(info);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fetch video information. Check the URL and try again.');
      setUrlInfo(null);
    } finally {
      setFetchingInfo(false);
    }
  };

  const handleUrlKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      fetchUrlInfo();
    }
  };

  // ── Upload / Import ─────────────────────────────────────────────────

  const uploadFileToBackend = async () => {
    if (!file) return;

    setUploading(true);
    setProgress(0);
    setStatusMessage('Uploading to server...');

    try {
      const formData = new FormData();
      formData.append('file', file);

      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 30);
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

      xhr.open('POST', '/api/upload');
      xhr.send(formData);

      const result = await uploadPromise;
      const { jobId } = result;

      setProgress(50);
      setStatusMessage('Pipeline started! Redirecting to project...');

      await new Promise(r => setTimeout(r, 500));
      router.push(`/projects/${jobId}`);

    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed. Please try again.');
      setUploading(false);
      setProgress(0);
      setStatusMessage('');
    }
  };

  const importFromUrl = async () => {
    if (!url.trim() || !urlInfo) {
      setError('Please fetch video info first by clicking "Check URL".');
      return;
    }

    setUploading(true);
    setProgress(0);
    setStatusMessage('Downloading video from URL...');

    try {
      const res = await fetch('/api/url-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'URL import failed');
      }

      const result = await res.json();
      const { jobId } = result;

      setProgress(70);
      setStatusMessage('Video downloaded and stored! Starting pipeline...');

      // Start pipeline
      try {
        const pipelineRes = await fetch(`/api/jobs/${jobId}/start-pipeline`);
        if (!pipelineRes.ok) {
          console.warn('Pipeline start returned non-OK, pipeline may still run via Inngest');
        }
      } catch (e) {
        console.warn('Could not start pipeline via backend, Inngest may handle it:', e);
      }

      setProgress(85);
      setStatusMessage('Pipeline started! Redirecting to project...');

      await new Promise(r => setTimeout(r, 500));
      router.push(`/projects/${jobId}`);

    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'URL import failed. Please try again.');
      setUploading(false);
      setProgress(0);
      setStatusMessage('');
    }
  };

  const handleSubmit = () => {
    if (uploading) return;
    if (mode === 'file') {
      if (file) uploadFileToBackend();
      else inputRef.current?.click();
    } else {
      if (urlInfo) importFromUrl();
      else if (url.trim()) fetchUrlInfo();
    }
  };

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-10 sm:py-12">
      <div className="w-full max-w-xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-xl sm:text-2xl font-semibold mb-2" style={{ color: 'var(--text-primary)', letterSpacing: '-0.03em' }}>
            {mode === 'file' ? 'Upload a video' : 'Import from URL'}
          </h1>
          <p className="text-sm px-2" style={{ color: 'var(--text-secondary)' }}>
            {mode === 'file'
              ? 'MP4, MOV, WebM, or MKV · Up to 5 GB · 2 hours max'
              : 'Paste a direct link to a video or audio file'
            }
          </p>
        </div>

        {/* Mode Tabs */}
        <div className="flex mb-6 rounded-lg p-1" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
          <button
            onClick={() => { setMode('file'); setError(null); setUrlInfo(null); }}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-md transition-all"
            style={{
              background: mode === 'file' ? 'var(--bg-card)' : 'transparent',
              color: mode === 'file' ? 'var(--text-primary)' : 'var(--text-muted)',
              boxShadow: mode === 'file' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            }}>
            <Upload size={14} />
            File upload
          </button>
          <button
            onClick={() => { setMode('url'); setError(null); setFile(null); }}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-md transition-all"
            style={{
              background: mode === 'url' ? 'var(--bg-card)' : 'transparent',
              color: mode === 'url' ? 'var(--text-primary)' : 'var(--text-muted)',
              boxShadow: mode === 'url' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            }}>
            <Link size={14} />
            Paste URL
          </button>
        </div>

        {/* ── FILE UPLOAD MODE ── */}
        {mode === 'file' && (
          <>
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
          </>
        )}

        {/* ── URL IMPORT MODE ── */}
        {mode === 'url' && (
          <div>
            {/* URL Input */}
            <div className="rounded-2xl transition-all duration-200"
              style={{
                border: `2px solid ${urlInfo ? 'var(--success)' : 'var(--border)'}`,
                background: 'var(--bg-card)',
                padding: '20px',
              }}>
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)' }}>
                    <Link size={18} style={{ color: 'var(--blue)' }} />
                  </div>
                  <div className="flex-1">
                    <label htmlFor="url-input" className="text-xs font-medium block mb-1" style={{ color: 'var(--text-secondary)' }}>
                      Media URL
                    </label>
                    <input
                      id="url-input"
                      ref={urlInputRef}
                      type="url"
                      placeholder="https://example.com/video.mp4"
                      value={url}
                      onChange={e => { setUrl(e.target.value); setUrlInfo(null); setError(null); }}
                      onKeyDown={handleUrlKeyDown}
                      disabled={uploading}
                      className="w-full bg-transparent text-sm outline-none"
                      style={{ color: 'var(--text-primary)' }}
                    />
                  </div>
                </div>

                {/* Supported sources hint */}
                <div className="flex flex-wrap gap-2">
                  <span
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs"
                    style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
                    <Globe size={10} />
                    Direct link to .mp4, .webm, .mov, .mkv, .avi, .mp3, .wav, .ogg
                  </span>
                </div>
              </div>
            </div>

            {/* Video Info Preview */}
            {fetchingInfo && (
              <div className="mt-4 flex items-center gap-3 px-4 py-3 rounded-lg"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                <Loader2 size={16} className="animate-spin" style={{ color: 'var(--accent)' }} />
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Fetching video information...</span>
              </div>
            )}

            {urlInfo && (
              <div className="mt-4 rounded-lg overflow-hidden"
                style={{ background: 'var(--bg-card)', border: '1px solid rgba(16,185,129,0.3)' }}>
                {/* Thumbnail */}
                {urlInfo.thumbnail && (
                  <div className="relative aspect-video bg-black/20">
                    <img
                      src={urlInfo.thumbnail}
                      alt={urlInfo.title}
                      className="w-full h-full object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  </div>
                )}
                {/* Info */}
                <div className="p-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 size={18} style={{ color: 'var(--success)', flexShrink: 0, marginTop: 2 }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                        {urlInfo.title}
                      </p>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
                        {urlInfo.uploader && (
                          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                            {urlInfo.uploader}
                          </p>
                        )}
                        {urlInfo.durationSeconds != null && (
                          <p className="text-xs" style={{ color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>
                            {formatDuration(urlInfo.durationSeconds)}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                {urlInfo.warning && (
                  <div className="flex items-start gap-2 px-4 py-3 border-t text-xs"
                    style={{ borderColor: 'rgba(245,158,11,0.25)', background: 'rgba(245,158,11,0.08)', color: 'var(--text-secondary)' }}>
                    <AlertTriangle size={14} style={{ color: '#f59e0b', flexShrink: 0, marginTop: 1 }} />
                    <span>{urlInfo.warning}</span>
                  </div>
                )}
              </div>
            )}

            {/* Check URL button (when no info yet) */}
            {!urlInfo && !fetchingInfo && url.trim() && (
              <div className="mt-3">
                <button
                  onClick={fetchUrlInfo}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all"
                  style={{
                    background: 'var(--bg-elevated)',
                    color: 'var(--text-secondary)',
                    border: '1px solid var(--border)',
                  }}>
                  <Globe size={14} />
                  Check URL
                </button>
              </div>
            )}

            {/* Change URL button (when info is shown) */}
            {urlInfo && (
              <div className="mt-2 text-right">
                <button
                  onClick={() => { setUrlInfo(null); setUrl(''); urlInputRef.current?.focus(); }}
                  className="text-xs underline transition-colors"
                  style={{ color: 'var(--text-muted)' }}>
                  Change URL
                </button>
              </div>
            )}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mt-3 flex items-start gap-2 px-4 py-3 rounded-lg text-sm"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: 'var(--danger)' }}>
            <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Progress */}
        {uploading && (
          <div className="mt-4">
            <div className="flex justify-between text-xs mb-1.5" style={{ color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>
              <span>{statusMessage || 'Processing...'}</span>
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
            onClick={handleSubmit}
            disabled={uploading || (mode === 'url' && !url.trim())}
            className="order-2 sm:order-1 flex-1 flex items-center justify-center gap-2 py-3 sm:py-2.5 rounded-lg text-sm font-semibold transition-all"
            style={{
              background: ((mode === 'file' && file) || (mode === 'url' && urlInfo))
                ? 'var(--accent)' : 'var(--bg-elevated)',
              color: ((mode === 'file' && file) || (mode === 'url' && urlInfo))
                ? 'white' : 'var(--text-muted)',
              boxShadow: ((mode === 'file' && file) || (mode === 'url' && urlInfo))
                ? '0 0 20px var(--accent-glow)' : 'none',
              cursor: uploading ? 'not-allowed' : 'pointer',
              opacity: uploading ? 0.7 : 1,
            }}>
            {uploading ? (
              <><Loader2 size={14} className="animate-spin" /> {progress < 35 ? 'Processing...' : 'Starting pipeline...'}</>
            ) : mode === 'file' ? (
              file ? <><Upload size={14} /> Start processing</> : <><File size={14} /> Choose a file</>
            ) : (
              urlInfo ? <><Link size={14} /> Import video</> : <><Link size={14} /> Paste a URL</>
            )}
          </button>
          {((mode === 'file' && file) || (mode === 'url' && urlInfo)) && !uploading && (
            <button onClick={() => {
              if (mode === 'file') { setFile(null); setError(null); }
              else { setUrlInfo(null); setUrl(''); setError(null); }
            }}
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