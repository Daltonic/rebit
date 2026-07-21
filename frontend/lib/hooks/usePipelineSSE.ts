'use client';

import { useEffect, useRef, useCallback } from 'react';
import { PipelineStep } from '@/lib/types';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';

export interface SSEEvent {
  type: 'connected' | 'step_update' | 'job_status' | 'pipeline_complete' | 'keepalive';
  stage?: string;
  status?: string;
  progressPct?: number;
  message?: string;
  jobId?: string;
  subscriberCount?: number;
  timestamp?: string;
}

export interface UsePipelineSSEOptions {
  jobId: string | undefined;
  onStepUpdate?: (step: { stage: string; status: string; progressPct: number; message: string }) => void;
  onJobStatus?: (status: string, message: string) => void;
  onPipelineComplete?: () => void;
  onError?: (error: string) => void;
  enabled?: boolean;
}

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
  onError,
  enabled = true,
}: UsePipelineSSEOptions) {
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;

  const connect = useCallback(() => {
    if (!jobId || !enabled) return;

    // Clean up any existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    const url = `${BACKEND_URL}/api/jobs/${jobId}/events`;
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
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
}