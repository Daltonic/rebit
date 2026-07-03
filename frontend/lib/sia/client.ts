/**
 * Sia Client Service
 *
 * Manages the Sia SDK singleton lifecycle, app key persistence,
 * and registration flow.
 *
 * Architecture (OpenBench pattern):
 *   - The frontend NEVER talks to the Sia SDK or Sia indexer directly.
 *   - All Sia operations are proxied through the backend (FastAPI),
 *     which owns the actual Sia SDK instance.
 *   - Recovery phrase is NEVER stored — only held in memory during
 *     the registration flow, then discarded.
 *   - Only the derived App Key is persisted to disk (by the backend).
 */

import type { SiaStatus, SiaRegistrationResponse, SiaCheckResponse } from '@/lib/types';

// ── Module State ───────────────────────────────────────────────────────

let _connected: boolean = false;
let _demoMode: boolean = false;
let _demoReason: string = '';
let _indexerUrl: string | null = null;

// ── Demo Mode Helpers ──────────────────────────────────────────────────

export function isDemoMode(): boolean {
  return _demoMode;
}

export function getDemoReason(): string {
  return _demoReason;
}

// ── Initialization ─────────────────────────────────────────────────────

export async function initSiaClient(
  indexerUrl: string,
  appId: string,
  appName: string,
  appDescription: string
): Promise<SiaStatus> {
  // If SIA_MODE=demo → return demo status immediately
  if (process.env.SIA_MODE === 'demo') {
    _demoMode = true;
    _demoReason = 'SIA_MODE env var set to demo';
    _connected = false;
    return { connected: false, demoMode: true, indexerUrl: null, reason: _demoReason };
  }

  _indexerUrl = indexerUrl;

  // Check backend Sia status — the backend handles the fast-path
  // reconnection using the stored AppKey on disk.
  try {
    const backendUrl = process.env.BACKEND_URL || 'http://backend:8000';
    const response = await fetch(`${backendUrl}/api/sia/status`);
    if (response.ok) {
      const data = await response.json();
      _connected = data.connected;
      _demoMode = data.mode === 'demo';
      _demoReason = data.reason || '';
      return {
        connected: data.connected,
        demoMode: data.mode === 'demo',
        indexerUrl: data.indexer_url || indexerUrl,
        reason: data.reason || null,
      };
    }
  } catch {
    // Backend unreachable — enter demo mode
  }

  // Backend unreachable or error → demo mode
  _demoMode = true;
  _demoReason = 'Backend unreachable — running in demo mode';
  _connected = false;

  return { connected: false, demoMode: true, indexerUrl: indexerUrl, reason: _demoReason };
}

// ── Registration Flow (proxied through backend) ────────────────────────

/**
 * Step 1: Start Sia registration.
 *
 * Proxies through the backend — the frontend NEVER talks to the
 * Sia indexer directly. The recovery phrase is sent to the backend
 * over HTTPS once, used to start registration, and then discarded.
 */
export async function registrationStart(
  recoveryPhrase: string,
  config: {
    indexerUrl: string;
    appId: string;
    appName: string;
    appDescription: string;
  }
): Promise<SiaRegistrationResponse> {
  // Already connected?
  if (_connected) {
    return { ok: false, error: 'Sia is already connected', already_connected: true };
  }

  // Validate recovery phrase (basic check: 12 or 24 space-separated words)
  const words = recoveryPhrase.trim().split(/\s+/);
  if (words.length !== 12 && words.length !== 24) {
    return {
      ok: false,
      error: 'Recovery phrase must be 12 or 24 words (BIP-39)',
    };
  }

  // Validate app ID (must be 64-char hex = 32 bytes)
  if (!/^[0-9a-f]{64}$/i.test(config.appId)) {
    return { ok: false, error: 'App ID must be a 64-character hex string (32 bytes)' };
  }

  try {
    // Proxy through the backend — the backend owns the Sia SDK
    const backendUrl = process.env.BACKEND_URL || 'http://backend:8000';
    const response = await fetch(`${backendUrl}/api/sia/register/init`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        indexer_url: config.indexerUrl,
        app_id: config.appId,
        app_name: config.appName,
        app_description: config.appDescription,
        recovery_phrase: recoveryPhrase,
      }),
    });

    const data = await response.json();

    if (data.ok && data.approval_url) {
      return { ok: true, approval_url: data.approval_url };
    }

    return { ok: false, error: data.error || 'Registration failed' };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { ok: false, error: `Failed to contact backend: ${message}` };
  }
}

/**
 * Step 2: Check if user approved the app on the Sia network.
 *
 * Proxies through the backend — the backend checks the Sia indexer
 * and completes registration if approved.
 */
export async function registrationCheck(config: {
  indexerUrl: string;
  appId: string;
}): Promise<SiaCheckResponse> {
  if (_connected) {
    return { ok: true, status: 'approved' };
  }

  try {
    // Proxy through the backend
    const backendUrl = process.env.BACKEND_URL || 'http://backend:8000';
    const response = await fetch(`${backendUrl}/api/sia/register/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        indexer_url: config.indexerUrl,
        app_id: config.appId,
      }),
    });

    const data = await response.json();

    if (data.ok && data.status === 'approved') {
      _connected = true;
      _demoMode = false;
      _demoReason = '';
      return { ok: true, status: 'approved' };
    }

    if (data.ok && data.status === 'pending') {
      return { ok: true, status: 'pending' };
    }

    return { ok: false, error: data.error || 'Failed to check approval status' };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { ok: false, error: `Failed to contact backend: ${message}` };
  }
}

/**
 * Reset the registration flow (cleanup on error or cancel).
 */
export function resetRegistrationFlow(): void {
  // Registration state is held on the backend — just clear local state
  _connected = false;
}

/**
 * Disconnect Sia — clears connection state and notifies backend.
 */
export async function disconnectSia(): Promise<void> {
  _connected = false;
  _demoMode = true;
  _demoReason = 'Disconnected by user';
  // Notify backend to clean up
  try {
    const backendUrl = process.env.BACKEND_URL || 'http://backend:8000';
    await fetch(`${backendUrl}/api/sia/disconnect`, { method: 'POST' });
  } catch {
    // Backend may be unreachable — ignore
  }
}

/**
 * Get current Sia status.
 */
export function getStatus(): SiaStatus {
  return {
    connected: _connected,
    demoMode: _demoMode,
    indexerUrl: _indexerUrl,
    reason: _demoReason || null,
  };
}

/**
 * Check if Sia is ready for uploads (connected in live mode).
 */
export function isReady(): boolean {
  return _connected && !_demoMode;
}