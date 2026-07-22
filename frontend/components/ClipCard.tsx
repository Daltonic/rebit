'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { Segment } from '@/lib/types';
import {
  Check, X, Clock, Zap, Heart, Download,
  Play, Pause, Volume2, VolumeX, Maximize2, AlertCircle, ChevronDown,
} from 'lucide-react';

function hookColor(h: string) {
  if (h === 'Strong') return 'var(--success)';
  if (h === 'Moderate') return 'var(--warning)';
  return 'var(--text-muted)';
}

function formatDur(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

/* ─── Custom video player ─── */
function VideoPlayer({ src, startSeconds, endSeconds }: { src: string; startSeconds: number; endSeconds: number }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(startSeconds);
  const [duration, setDuration] = useState(endSeconds - startSeconds);
  const [hovered, setHovered] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialSeekDone = useRef(false);
  const clipDuration = endSeconds - startSeconds;

  // Seek to start once metadata loads
  const onMeta = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    setDuration(v.duration);
    if (!initialSeekDone.current) {
      initialSeekDone.current = true;
      v.currentTime = startSeconds;
    }
  }, [startSeconds]);

  const onTimeUpdate = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    // Stop at endSeconds
    if (v.currentTime >= endSeconds) {
      v.pause();
      v.currentTime = startSeconds;
      setPlaying(false);
      setProgress(0);
      setCurrentTime(startSeconds);
      return;
    }
    const elapsed = v.currentTime - startSeconds;
    setCurrentTime(v.currentTime);
    setProgress(clipDuration > 0 ? (elapsed / clipDuration) * 100 : 0);
  }, [startSeconds, endSeconds, clipDuration]);

  const onEnded = useCallback(() => {
    setPlaying(false);
    setProgress(0);
  }, []);

  const onError = useCallback(() => {
    const v = videoRef.current;
    const code = v?.error?.code;
    // code 4 = MEDIA_ERR_SRC_NOT_SUPPORTED
    if (code === 4) {
      setError('Video format not supported or source unavailable.');
    } else {
      setError('Could not load video.');
    }
    setPlaying(false);
  }, []);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.addEventListener('loadedmetadata', onMeta);
    v.addEventListener('timeupdate', onTimeUpdate);
    v.addEventListener('ended', onEnded);
    v.addEventListener('error', onError);
    return () => {
      v.removeEventListener('loadedmetadata', onMeta);
      v.removeEventListener('timeupdate', onTimeUpdate);
      v.removeEventListener('ended', onEnded);
      v.removeEventListener('error', onError);
    };
  }, [onMeta, onTimeUpdate, onEnded, onError]);

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (error) return;
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      // If we're past end, reset
      if (v.currentTime >= endSeconds) v.currentTime = startSeconds;
      v.play().catch(() => setError('Playback failed. Check the video source.'));
      setPlaying(true);
    } else {
      v.pause();
      setPlaying(false);
    }
  };

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  };

  const fullscreen = (e: React.MouseEvent) => {
    e.stopPropagation();
    videoRef.current?.requestFullscreen?.();
  };

  const seek = (e: Pick<React.MouseEvent<HTMLDivElement>, 'clientX' | 'currentTarget' | 'stopPropagation'>) => {
    e.stopPropagation();
    if (error) return;
    const v = videoRef.current;
    if (!v || !v.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    v.currentTime = startSeconds + ratio * clipDuration;
  };

  if (error) {
    return (
      <div className="relative w-full flex flex-col items-center justify-center gap-2"
        style={{ height: 180, background: '#0a0a0a' }}>
        <AlertCircle size={24} style={{ color: 'var(--text-muted)' }} />
        <p style={{ color: 'var(--text-muted)', fontSize: 11, textAlign: 'center', maxWidth: 200 }}>{error}</p>
      </div>
    );
  }

  return (
    <div
      className="relative w-full select-none"
      style={{ height: 180, background: '#0a0a0a', cursor: 'pointer' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={toggle}
    >
      <video
        ref={videoRef}
        src={src}
        preload="metadata"
        className="w-full h-full"
        style={{ display: 'block', objectFit: 'cover', pointerEvents: 'none' }}
      />

      {/* Big centre play/pause */}
      <div
        className="absolute inset-0 flex items-center justify-center transition-opacity duration-200"
        style={{ opacity: !playing || hovered ? 1 : 0, pointerEvents: 'none' }}
      >
        <div style={{
          width: 44, height: 44, borderRadius: '50%',
          background: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(6px)',
          border: '1.5px solid rgba(255,255,255,0.18)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {playing
            ? <Pause size={18} fill="white" style={{ color: 'white' }} />
            : <Play size={18} fill="white" style={{ color: 'white', marginLeft: 2 }} />
          }
        </div>
      </div>

      {/* Bottom control bar */}
      <div
        className="absolute bottom-0 left-0 right-0 transition-opacity duration-200"
        style={{
          opacity: hovered || !playing ? 1 : 0,
          background: 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 100%)',
          padding: '24px 10px 8px',
          pointerEvents: hovered || !playing ? 'auto' : 'none',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Progress bar */}
        <div
          className="w-full mb-2 cursor-pointer"
          style={{ height: 14, display: 'flex', alignItems: 'center', position: 'relative' }}
          onClick={seek}
          onMouseMove={e => { if (e.buttons === 1) seek(e); }}
          onTouchStart={e => { const t = e.touches[0]; if (t) seek({ clientX: t.clientX, currentTarget: e.currentTarget, stopPropagation: () => e.stopPropagation() }); }}
        >
          <div style={{ width: '100%', height: 3, background: 'rgba(255,255,255,0.2)', borderRadius: 2, position: 'relative' }}>
            <div style={{
              position: 'absolute', left: 0, top: 0, bottom: 0,
              width: `${progress}%`,
              background: 'var(--accent-bright, #7c3aed)',
              borderRadius: 2,
              transition: 'width 0.1s linear',
            }} />
            <div style={{
              position: 'absolute', top: '50%', left: `${progress}%`,
              transform: 'translate(-50%, -50%)',
              width: 10, height: 10, borderRadius: '50%',
              background: 'white',
              boxShadow: '0 0 4px rgba(0,0,0,0.4)',
            }} />
          </div>
        </div>

        {/* Controls row */}
        <div className="flex items-center gap-1">
          <button onClick={toggle} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 6, minWidth: 28, minHeight: 28 }}>
            {playing
              ? <Pause size={13} fill="white" style={{ color: 'white' }} />
              : <Play size={13} fill="white" style={{ color: 'white' }} />
            }
          </button>

          <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 10, fontFamily: 'var(--mono)', letterSpacing: '0.03em' }}>
            {formatDur(currentTime - startSeconds)} / {formatDur(clipDuration)}
          </span>

          <div style={{ flex: 1 }} />

          <button onClick={toggleMute} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 6, minWidth: 28, minHeight: 28 }}>
            {muted
              ? <VolumeX size={13} style={{ color: 'rgba(255,255,255,0.7)' }} />
              : <Volume2 size={13} style={{ color: 'rgba(255,255,255,0.7)' }} />
            }
          </button>

          <button onClick={fullscreen} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 6, minWidth: 28, minHeight: 28 }}>
            <Maximize2 size={12} style={{ color: 'rgba(255,255,255,0.7)' }} />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Placeholder when no sourceUrl ─── */
function VideoPlaceholder() {
  return (
    <div className="relative w-full flex items-center justify-center"
      style={{ height: 180, background: 'var(--bg-elevated)' }}>
      <div style={{
        width: 44, height: 44, borderRadius: '50%',
        background: 'rgba(124,58,237,0.15)',
        border: '1.5px solid var(--accent)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Play size={16} fill="var(--accent-bright)" style={{ color: 'var(--accent-bright)', marginLeft: 2 }} />
      </div>
    </div>
  );
}

/* ─── Main card ─── */
interface ClipCardProps {
  segment: Segment;
  sourceUrl?: string;
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
}

const TRANSCRIPT_CLAMP_LENGTH = 130;

export default function ClipCard({ segment, sourceUrl, onApprove, onReject }: ClipCardProps) {
  const [status, setStatus] = useState(segment.status);
  const [expanded, setExpanded] = useState(false);
  const clipDuration = segment.endSeconds - segment.startSeconds;
  const isLongTranscript = segment.transcriptExcerpt.length > TRANSCRIPT_CLAMP_LENGTH;

  const handleApprove = (e: React.MouseEvent) => {
    e.stopPropagation();
    setStatus('approved');
    onApprove?.(segment.id);
  };
  const handleReject = (e: React.MouseEvent) => {
    e.stopPropagation();
    setStatus('rejected');
    onReject?.(segment.id);
  };
  const toggleExpanded = (e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded(v => !v);
  };

  const borderColor = status === 'approved'
    ? 'rgba(16,185,129,0.3)'
    : status === 'rejected'
      ? 'rgba(239,68,68,0.15)'
      : 'var(--border)';

  return (
    <div
      className="rounded-xl overflow-hidden transition-all duration-200"
      style={{
        border: `1px solid ${borderColor}`,
        background: 'var(--bg-card)',
        opacity: status === 'rejected' ? 0.5 : 1,
        position: 'relative',
        pointerEvents: 'auto',
      }}
    >
      {/* Video area */}
      <div style={{ position: 'relative' }}>
        {sourceUrl
          ? <VideoPlayer
            src={sourceUrl}
            startSeconds={segment.startSeconds}
            endSeconds={segment.endSeconds}
          />
          : <VideoPlaceholder />
        }

        {/* Virality badge — the one place score lives, so it isn't repeated below */}
        <div
          className="absolute top-2 right-2 px-2 py-0.5 rounded text-xs font-semibold"
          style={{
            background: 'rgba(0,0,0,0.7)',
            color: segment.viralityScore >= 80
              ? 'var(--success)'
              : segment.viralityScore >= 60
                ? 'var(--warning)'
                : 'var(--text-secondary)',
            fontFamily: 'var(--mono)',
            backdropFilter: 'blur(4px)',
            zIndex: 10,
            pointerEvents: 'none',
          }}
        >
          {segment.viralityScore}
        </div>

        {/* Status pill */}
        {status !== 'pending' && (
          <div
            className="absolute top-2 left-2 px-2 py-1 rounded flex items-center gap-1.5"
            style={{
              background: status === 'approved' ? 'rgba(16,185,129,0.85)' : 'rgba(239,68,68,0.85)',
              backdropFilter: 'blur(4px)',
              zIndex: 15,
              pointerEvents: 'none',
            }}
          >
            {status === 'approved'
              ? <Check size={14} style={{ color: 'white' }} strokeWidth={3} />
              : <X size={14} style={{ color: 'white' }} strokeWidth={3} />
            }
            <span style={{ color: 'white', fontSize: 11, fontWeight: 600, textTransform: 'capitalize' }}>
              {status}
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-3.5 space-y-2.5">
        {/* Transcript — clamped to 3 lines by default so cards stay even in the grid */}
        <div>
          <p
            className="text-sm leading-relaxed"
            style={{
              color: 'var(--text-secondary)',
              display: '-webkit-box',
              WebkitLineClamp: expanded ? 'unset' : 3,
              WebkitBoxOrient: 'vertical',
              overflow: expanded ? 'visible' : 'hidden',
            }}
          >
            &quot;{segment.transcriptExcerpt}&quot;
          </p>
          {isLongTranscript && (
            <button
              onClick={toggleExpanded}
              className="mt-1 flex items-center gap-1 text-xs font-medium"
              style={{ color: 'var(--accent-bright)' }}
            >
              {expanded ? 'Show less' : 'Show more'}
              <ChevronDown size={11} style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
            </button>
          )}
        </div>

        {/* Meta — one compact row instead of four stacked label/value lines */}
        <div className="flex items-center flex-wrap gap-x-3 gap-y-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
          <span className="inline-flex items-center gap-1" style={{ color: hookColor(segment.hookStrength) }}>
            <Zap size={11} />{segment.hookStrength} hook
          </span>
          <span className="inline-flex items-center gap-1">
            <Heart size={11} style={{ color: 'var(--danger)' }} />{segment.emotionalSignal}
          </span>
          <span className="inline-flex items-center gap-1" style={{ fontFamily: 'var(--mono)' }}>
            <Clock size={11} style={{ color: 'var(--text-muted)' }} />{Math.round(clipDuration)}s
          </span>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-1" style={{ borderTop: '1px solid var(--border)', marginTop: 4, paddingTop: 10 }}>
          {status === 'approved' ? (
            <button
              onClick={e => e.stopPropagation()}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 sm:py-2 rounded text-xs font-medium transition-colors"
              style={{ background: 'rgba(16,185,129,0.1)', color: 'var(--success)', border: '1px solid rgba(16,185,129,0.2)', cursor: 'pointer' }}
            >
              <Download size={12} /> Export MP4
            </button>
          ) : status === 'rejected' ? (
            <button
              onClick={handleApprove}
              className="flex-1 py-2.5 sm:py-2 rounded text-xs font-medium transition-colors"
              style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)', cursor: 'pointer' }}
            >
              Restore
            </button>
          ) : (
            <>
              <button
                onClick={handleApprove}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 sm:py-2 rounded text-xs font-medium transition-all active:opacity-80 sm:hover:opacity-90"
                style={{ background: 'rgba(16,185,129,0.12)', color: 'var(--success)', border: '1px solid rgba(16,185,129,0.25)', cursor: 'pointer' }}
              >
                <Check size={12} /> Approve
              </button>
              <button
                onClick={handleReject}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 sm:py-2 rounded text-xs font-medium transition-all active:opacity-80 sm:hover:opacity-90"
                style={{ background: 'rgba(239,68,68,0.08)', color: 'var(--danger)', border: '1px solid rgba(239,68,68,0.2)', cursor: 'pointer' }}
              >
                <X size={12} /> Reject
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}