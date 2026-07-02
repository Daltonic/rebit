/**
 * Sia Client Service
 *
 * Manages the Sia SDK singleton lifecycle, app key persistence,
 * and registration flow. Adapted for Next.js — the SDK state is
 * held in module-level variables (Node.js process memory) since
 * there's no separate Python backend.
 *
 * Security:
 * - BIP-39 recovery phrase is NEVER stored — only held in memory
 *   during the registration flow, then discarded.
 * - Only the derived App Key is persisted to disk at SIA_KEY_PATH.
 * - Double-submit protection: if registration is pending, return
 *   existing approval URL.
 */

import type { SiaStatus, SiaRegistrationResponse, SiaCheckResponse } from '@/lib/types';

// ── Configuration ──────────────────────────────────────────────────────

const SIA_KEY_PATH = process.env.SIA_KEY_PATH || '/tmp/sia/appkey.hex';
const SIA_APP_SERVICE_URL =
  process.env.SIA_APP_SERVICE_URL || process.env.AUTH_URL || 'http://localhost:3000';

// ── Module State ───────────────────────────────────────────────────────

interface RegistrationFlow {
  phrase: string | null;
  approvalUrl: string | null;
  step: 'idle' | 'pending_approval' | 'completed' | 'failed';
  error: string | null;
  appKeyHex: string | null;
}

let _connected: boolean = false;
let _demoMode: boolean = false;
let _demoReason: string = '';
let _indexerUrl: string | null = null;

// Ephemeral registration flow state (NEVER persisted to DB)
let _registrationFlow: RegistrationFlow = {
  phrase: null,
  approvalUrl: null,
  step: 'idle',
  error: null,
  appKeyHex: null,
};

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

  // Try stored key first (fast path)
  const storedKey = await loadStoredKey();
  if (storedKey) {
    try {
      // Validate the stored key by attempting a connection check
      const response = await fetch(`${indexerUrl}/api/v1/apps/${appId}/status`, {
        headers: { Authorization: `Bearer ${storedKey}` },
      });
      if (response.ok) {
        _connected = true;
        _demoMode = false;
        return { connected: true, demoMode: false, indexerUrl: indexerUrl, reason: null };
      }
    } catch {
      // Connection failed — will fall through to demo mode
    }
  }

  // No stored key or rejected → enter demo mode
  _demoMode = true;
  _demoReason = storedKey
    ? 'Stored app key rejected by indexer — please re-register via setup wizard'
    : 'Sia not configured — use the setup wizard to connect';
  _connected = false;

  return { connected: false, demoMode: true, indexerUrl: indexerUrl, reason: _demoReason };
}

// ── Registration Flow ──────────────────────────────────────────────────

/**
 * Step 1: Start Sia registration.
 *
 * Accepts a BIP-39 recovery phrase and returns an approval URL.
 * The phrase is held in memory only — it is NEVER persisted.
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

  // If already pending, return existing approval URL (prevents double-submit)
  if (
    _registrationFlow.step === 'pending_approval' &&
    _registrationFlow.approvalUrl
  ) {
    return { ok: true, approval_url: _registrationFlow.approvalUrl };
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

  // Validate indexer URL
  if (!config.indexerUrl) {
    return { ok: false, error: 'Indexer URL is required' };
  }

  try {
    // Call the Sia indexer to request a connection
    const response = await fetch(
      `${config.indexerUrl}/api/v1/apps/${config.appId}/request-connection`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appName: config.appName,
          appDescription: config.appDescription,
          serviceUrl: SIA_APP_SERVICE_URL,
          recoveryPhrase,
        }),
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      return {
        ok: false,
        error: `Indexer rejected connection request: ${errorBody}`,
      };
    }

    const data = await response.json();
    const approvalUrl = data.approval_url || data.url;

    if (!approvalUrl) {
      return { ok: false, error: 'Indexer did not return an approval URL' };
    }

    // Store flow state in memory only
    _registrationFlow = {
      phrase: recoveryPhrase,
      approvalUrl,
      step: 'pending_approval',
      error: null,
      appKeyHex: null,
    };

    return { ok: true, approval_url: approvalUrl };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { ok: false, error: `Failed to contact Sia indexer: ${message}` };
  }
}

/**
 * Step 2: Check if user approved the app on the Sia indexer.
 */
export async function registrationCheck(config: {
  indexerUrl: string;
  appId: string;
}): Promise<SiaCheckResponse> {
  if (_connected) {
    return { ok: true, status: 'approved' };
  }

  if (_registrationFlow.step === 'idle') {
    return { ok: false, error: 'No pending registration flow. Please start registration first.' };
  }

  if (!_registrationFlow.phrase) {
    return { ok: false, error: 'Registration flow corrupted — recovery phrase missing from memory' };
  }

  try {
    // Check if the app has been approved on the indexer
    const response = await fetch(
      `${config.indexerUrl}/api/v1/apps/${config.appId}/approval-status`,
      {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recoveryPhrase: _registrationFlow.phrase }),
      }
    );

    if (!response.ok) {
      // Still pending
      return { ok: true, status: 'pending' };
    }

    const data = await response.json();

    // The indexer approved the connection — complete registration
    if (data.approved || data.status === 'approved') {
      // Save the derived app key
      const appKeyHex = data.appKey || data.app_key;
      if (appKeyHex) {
        await saveKey(appKeyHex);
        _registrationFlow.appKeyHex = appKeyHex;
      }

      // Mark as connected
      _connected = true;
      _demoMode = false;
      _demoReason = '';
      _registrationFlow.step = 'completed';

      // Discard the recovery phrase from memory
      _registrationFlow.phrase = null;

      return { ok: true, status: 'approved' };
    }

    // Still pending
    return { ok: true, status: 'pending' };
  } catch {
    // Network error — assume still pending
    return { ok: true, status: 'pending' };
  }
}

/**
 * Reset the registration flow (cleanup on error or cancel).
 */
export function resetRegistrationFlow(): void {
  _registrationFlow = {
    phrase: null,
    approvalUrl: null,
    step: 'idle',
    error: null,
    appKeyHex: null,
  };
}

/**
 * Disconnect Sia — clears connection state and deletes stored key.
 */
export async function disconnectSia(): Promise<void> {
  _connected = false;
  _demoMode = true;
  _demoReason = 'Disconnected by user';
  resetRegistrationFlow();
  // Remove stored key file
  try {
    const fs = await import('fs/promises');
    await fs.unlink(SIA_KEY_PATH);
  } catch {
    // File may not exist — ignore
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

// ── Key Persistence ────────────────────────────────────────────────────

async function loadStoredKey(): Promise<string | null> {
  try {
    const fs = await import('fs/promises');
    const key = await fs.readFile(SIA_KEY_PATH, 'utf-8');
    return key.trim();
  } catch {
    return null;
  }
}

async function saveKey(keyHex: string): Promise<void> {
  try {
    const fs = await import('fs/promises');
    const path = await import('path');
    await fs.mkdir(path.dirname(SIA_KEY_PATH), { recursive: true });
    await fs.writeFile(SIA_KEY_PATH, keyHex.trim(), 'utf-8');
  } catch (err) {
    console.error('Failed to persist Sia app key:', err);
  }
}