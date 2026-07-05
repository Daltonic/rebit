/**
 * Sia Upload Service
 *
 * Provides the upload + pin pipeline for storing task/job artifacts
 * on the Sia decentralized storage network. Adapted for Next.js.
 *
 * Demo mode: when Sia is not connected, returns a fake "demo-sia-{id}"
 * hash so the pipeline can continue without actual Sia infrastructure.
 */

import { isReady, getStatus } from './client';
import type { SiaUploadStatus } from '@/lib/types';

// ── Constants ──────────────────────────────────────────────────────────

const DEMO_PREFIX = 'demo-sia-';
const SIA_UPLOAD_TIMEOUT = 300_000; // 5 minutes
const SIA_PIN_TIMEOUT = 120_000;    // 2 minutes

// ── Types ──────────────────────────────────────────────────────────────

export interface UploadResult {
  objectId: string;
  siaHash: string;
  status: SiaUploadStatus;
  demo: boolean;
}

export type StatusCallback = (status: SiaUploadStatus, message: string) => void;

// ── Upload Pipeline ────────────────────────────────────────────────────

/**
 * Upload a file or directory to Sia and pin it.
 *
 * @param id - The job/task ID for this upload
 * @param data - The file content as a Buffer or string
 * @param filename - The filename to store on Sia
 * @param extraMeta - Optional metadata to attach
 * @param onStatus - Optional callback for status updates
 * @returns UploadResult with the Sia object ID
 */
export async function uploadToSia(
  id: string,
  data: Buffer | string,
  filename: string,
  extraMeta?: Record<string, string>,
  onStatus?: StatusCallback
): Promise<UploadResult> {
  // If Sia is not connected, return demo result
  if (!isReady()) {
    const status = getStatus();
    const objectId = `${DEMO_PREFIX}${id}`;
    if (onStatus) {
      onStatus('uploading', `Sia in demo mode (${status.reason || 'not configured'})`);
      onStatus('ready', 'Demo upload complete');
    }
    return {
      objectId,
      siaHash: objectId,
      status: 'ready',
      demo: true,
    };
  }

  const status = getStatus();
  const indexerUrl = status.indexerUrl;

  if (!indexerUrl) {
    throw new Error('Sia indexer URL not configured');
  }

  try {
    // Step 1: Upload
    if (onStatus) onStatus('uploading', `Uploading ${filename} to Sia...`);

    const uploadResult = await performUpload(indexerUrl, data, filename, extraMeta);

    // Step 2: Pin
    if (onStatus) onStatus('pinning', `Pinning ${uploadResult.id} on Sia...`);

    await performPin(indexerUrl, uploadResult.id);

    // Done
    if (onStatus) onStatus('ready', `Upload complete — ${uploadResult.id}`);

    return {
      objectId: uploadResult.id,
      siaHash: uploadResult.id,
      status: 'ready',
      demo: false,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown upload error';
    if (onStatus) onStatus('failed', message);
    throw err;
  }
}

// ── Internal Upload Functions ──────────────────────────────────────────

interface SiaObjectResponse {
  id: string;
  oid?: string;
}

async function performUpload(
  indexerUrl: string,
  data: Buffer | string,
  filename: string,
  extraMeta?: Record<string, string>
): Promise<SiaObjectResponse> {
  // Build form data for upload
  const formData = new FormData();

  // Convert data to Blob
  const blob =
    typeof data === 'string'
      ? new Blob([data], { type: 'text/plain' })
      : new Blob([new Uint8Array(data)], { type: 'application/octet-stream' });

  formData.append('file', blob, filename);

  // Add metadata
  formData.append('metadata', JSON.stringify({
    filename,
    uploadedAt: new Date().toISOString(),
    ...extraMeta,
  }));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SIA_UPLOAD_TIMEOUT);

  try {
    const response = await fetch(`${indexerUrl}/api/v1/objects/upload`, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Sia upload failed (${response.status}): ${errorText}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function performPin(indexerUrl: string, objectId: string): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SIA_PIN_TIMEOUT);

  try {
    const response = await fetch(
      `${indexerUrl}/api/v1/objects/${objectId}/pin`,
      {
        method: 'POST',
        signal: controller.signal,
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Sia pin failed (${response.status}): ${errorText}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Upload a segment clip to Sia.
 */
export async function uploadSegmentClip(
  segmentId: string,
  clipData: Buffer,
  clipFilename: string
): Promise<UploadResult> {
  return uploadToSia(segmentId, clipData, clipFilename, {
    type: 'segment-clip',
    segmentId,
  });
}

/**
 * Upload a source video file to Sia.
 */
export async function uploadSourceVideo(
  jobId: string,
  videoData: Buffer,
  originalFilename: string
): Promise<UploadResult> {
  return uploadToSia(jobId, videoData, originalFilename, {
    type: 'source-video',
    jobId,
  });
}

/**
 * Upload a transcript to Sia.
 */
export async function uploadTranscript(
  jobId: string,
  transcriptContent: string,
  filename: string = `transcript-${jobId}.vtt`
): Promise<UploadResult> {
  return uploadToSia(jobId, transcriptContent, filename, {
    type: 'transcript',
    jobId,
  });
}