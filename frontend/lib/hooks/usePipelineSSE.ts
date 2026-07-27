'use client';

import { useEffect, useRef, useCallback } from 'react';

export interface SSEEvent {
  type: 'connected' | 'step_update' | 'job_status' | 'pipeline_complete' | 'keepalive' | 'sia_log';
  stage?: string;
  status?: string;
  progressPct?: number;
  message?: string;
  jobId?: string;
  subscriberCount?: number;
  timestamp?: string;
  step?: string;
  passed?: boolean | null;
}

export interface UsePipelineSSEOptions {
  jobId: string | undefined;
  onStepUpdate?: (step: { stage: string; status: string; progressPct: number; message: string }) => void;
  onJobStatus?: (status: string, message: string) => void;
  onPipelineComplete?: () => void;
  onSiaLog?: (log: { step: string; passed: boolean | null; message: string }) => void;
  onError?: (error: string) => void;
  enabled?: boolean;
}

// If no event of any kind (including keepalives) has arrived in this
// long, treat the connection as silently dead rather than actually
// erroring. A browser EventSource only fires onerror when the
// underlying TCP connection actually drops — it stays "open" from the
// browser's point of view even if the server-side generator stalls, so
// this is the only way to detect "still connected, but nothing is
// coming through anymore" and fall back to polling.
const SILENT_CONNECTION_TIMEOUT_MS = 60_000;
const SILENT_CHECK_INTERVAL_MS = 15_000;

/**
 * Hook that connects to the backend SSE endpoint for real-time pipeline updates.
 *
 * - Opens a single EventSource connection per jobId
 * - Parses incoming events and calls the appropriate callback
 * - Automatically reconnects on connection loss (EventSource built-in)
 * - Cleans up on unmount or jobId change
 *
 * Falls back gracefully: if SSE fails, the page still has its polling fallback.
 */
export function usePipelineSSE({
  jobId,
  onStepUpdate,
  onJobStatus,
  onPipelineComplete,
  onSiaLog,
  onError,
  enabled = true,
}: UsePipelineSSEOptions) {
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;
  const lastEventTimeRef = useRef(Date.now());
  const silentFallbackFiredRef = useRef(false);

  const connect = useCallback(function connect() {
    if (!jobId || !enabled) return;

    // Clean up any existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    const url = `/api/jobs/${jobId}/events`;
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      // Any event at all — including keepalives — proves the connection
      // is alive and the server is still ticking, so reset the silent
      // watchdog here regardless of event type.
      lastEventTimeRef.current = Date.now();
      silentFallbackFiredRef.current = false;

      try {
        const data: SSEEvent = JSON.parse(event.data);

        switch (data.type) {
          case 'connected':
            // Connection established — reset reconnect counter
            reconnectAttemptsRef.current = 0;
            break;

          case 'step_update':
            if (data.stage && data.status !== undefined) {
              onStepUpdate?.({
                stage: data.stage,
                status: data.status,
                progressPct: data.progressPct ?? 0,
                message: data.message ?? '',
              });
            }
            break;

          case 'job_status':
            if (data.status) {
              onJobStatus?.(data.status, data.message ?? '');
              if (data.status === 'complete') {
                onPipelineComplete?.();
              }
            }
            break;

          case 'sia_log':
            if (data.step && data.message !== undefined) {
              onSiaLog?.({
                step: data.step,
                passed: data.passed ?? null,
                message: data.message,
              });
            }
            break;

          case 'keepalive':
            // No-op, just keeps the connection alive
            break;

          default:
            break;
        }
      } catch (e) {
        console.warn('[usePipelineSSE] Failed to parse event:', e);
      }
    };

    es.onerror = () => {
      es.close();
      eventSourceRef.current = null;

      // Attempt reconnection with exponential backoff
      if (reconnectAttemptsRef.current < maxReconnectAttempts) {
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 10000);
        reconnectAttemptsRef.current += 1;
        console.warn(`[usePipelineSSE] Connection lost, reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current}/${maxReconnectAttempts})`);

        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, delay);
      } else {
        console.warn('[usePipelineSSE] Max reconnection attempts reached, falling back to polling');
        onError?.('SSE connection failed after max retries');
      }
    };
  }, [jobId, enabled, onStepUpdate, onJobStatus, onPipelineComplete, onError]);

  useEffect(() => {
    connect();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, [connect]);

  // ── Silent-connection watchdog ────────────────────────────────────────
  // The server sends a keepalive every 30s, so under normal operation
  // lastEventTimeRef never goes stale. If it does — a proxy buffering
  // the stream, the server's event generator wedging — this is the only
  // way to notice, since EventSource.onerror won't fire for a
  // connection that's still technically open.
  useEffect(() => {
    if (!jobId || !enabled) return;

    lastEventTimeRef.current = Date.now();
    silentFallbackFiredRef.current = false;

    const interval = setInterval(() => {
      const elapsed = Date.now() - lastEventTimeRef.current;
      if (elapsed > SILENT_CONNECTION_TIMEOUT_MS && !silentFallbackFiredRef.current) {
        silentFallbackFiredRef.current = true;
        console.warn(`[usePipelineSSE] No events for ${Math.round(elapsed / 1000)}s, falling back to polling`);
        onError?.('SSE connection silent — falling back to polling');
      }
    }, SILENT_CHECK_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [jobId, enabled, onError]);
}