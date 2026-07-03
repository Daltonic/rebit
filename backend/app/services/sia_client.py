"""
Sia SDK singleton manager.

Uses the `sia-storage` Python SDK (v0.8.0) to manage the Sia connection
lifecycle — initialization, app key persistence, registration, and SDK
instance management.

Architecture:
  - Singleton `_sdk` instance guarded by `asyncio.Lock`
  - Two init paths:
    1. Fast path: stored AppKey on disk → SDK.connected(app_key)
    2. Registration path: setup wizard → Builder → register(phrase) → SDK
  - Recovery phrase is NEVER stored — only the derived AppKey is persisted.
"""

import asyncio
import logging
from pathlib import Path
from typing import Optional

from sia_storage import (
    AppKey,
    AppMetadata,
    Builder,
    SDK,
    generate_recovery_phrase,
    uniffi_set_event_loop,
    validate_recovery_phrase,
)

from backend.app.config import settings

logger = logging.getLogger(__name__)

# ── Initialize SDK event loop ────────────────────────────────────────────
# The sia-storage SDK requires the event loop to be set before any operations.
try:
    loop = asyncio.get_running_loop()
except RuntimeError:
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
uniffi_set_event_loop(loop)

# ── Module State ─────────────────────────────────────────────────────────

_sdk: Optional[SDK] = None
_demo_mode: bool = False
_demo_reason: str = ""
_indexer_url: Optional[str] = None
_sdk_lock = asyncio.Lock()

# Registration flow state (ephemeral, NEVER persisted)
_registration_builder: Optional[Builder] = None
_registration_phrase: Optional[str] = None


# ── Public API ───────────────────────────────────────────────────────────

async def get_sdk() -> Optional[SDK]:
    """Get the initialized SDK instance, or None if not connected."""
    async with _sdk_lock:
        return _sdk


async def init_sia_client(
    indexer_url: str,
    app_id_hex: str,
    app_name: str,
    app_description: str,
) -> dict:
    """
    Initialize the Sia client.
    
    1. Try loading a stored AppKey from disk
    2. If valid → SDK.connected(key) → connected
    3. If no key → demo mode
    """
    global _sdk, _demo_mode, _demo_reason, _indexer_url

    async with _sdk_lock:
        _indexer_url = indexer_url

        # If SIA_MODE=demo, skip entirely
        if settings.is_demo_mode:
            _demo_mode = True
            _demo_reason = "SIA_MODE env var set to demo"
            _sdk = None
            return {"connected": False, "demo": True, "reason": _demo_reason}

        # Try stored AppKey (fast path)
        app_key = _load_app_key()
        if app_key is not None:
            try:
                sdk = SDK.connected(app_key)
                # Verify by checking account
                account = sdk.account()
                _sdk = sdk
                _demo_mode = False
                _demo_reason = ""
                logger.info("Sia SDK initialized via stored AppKey")
                return {"connected": True, "demo": False, "reason": None}
            except Exception as e:
                logger.warning(f"Stored AppKey rejected: {e}")
                # Fall through to demo mode

        # No valid stored key → demo mode
        _demo_mode = True
        _demo_reason = (
            "Sia not configured — use the setup wizard to connect"
        )
        _sdk = None
        return {"connected": False, "demo": True, "reason": _demo_reason}


async def registration_start(
    indexer_url: str,
    app_id_hex: str,
    app_name: str,
    app_description: str,
    recovery_phrase: str,
    service_url: str = "http://localhost:3000",
) -> dict:
    """
    Step 1: Start Sia registration.

    Uses the Builder to create a connection request with the Sia network.
    Returns an approval URL the user must visit to authorize the app.

    The recovery phrase is held in memory ONLY during this flow.
    """
    global _registration_builder, _registration_phrase

    # Validate BIP-39 phrase
    try:
        validate_recovery_phrase(recovery_phrase)
    except Exception as e:
        return {"ok": False, "error": f"Invalid recovery phrase: {e}"}

    # Convert app ID from hex (64-char) to 32 bytes
    try:
        app_id_bytes = bytes.fromhex(app_id_hex)
    except ValueError:
        return {"ok": False, "error": "App ID must be a 64-character hex string (32 bytes)"}

    if len(app_id_bytes) != 32:
        return {"ok": False, "error": "App ID must be exactly 32 bytes (64 hex chars)"}

    try:
        # Build AppMetadata
        metadata = AppMetadata(
            id=app_id_bytes,
            name=app_name,
            description=app_description,
            service_url=service_url,
            logo_url=None,
            callback_url=None,
        )

        # Create builder and request connection
        builder = Builder(metadata).request_connection()
        approval_url = builder.response_url()

        _registration_builder = builder
        _registration_phrase = recovery_phrase

        logger.info(f"Sia registration started, approval URL: {approval_url}")
        return {"ok": True, "approval_url": approval_url}

    except Exception as e:
        _registration_builder = None
        _registration_phrase = None
        logger.error(f"Sia registration failed: {e}")
        return {"ok": False, "error": f"Registration failed: {e}"}


async def registration_check() -> dict:
    """
    Step 2: Check if the user approved the app on the Sia network.

    If approved, calls builder.register(phrase) to derive and persist
    the AppKey. The recovery phrase is then discarded from memory.
    """
    global _sdk, _demo_mode, _demo_reason, _registration_builder, _registration_phrase

    if _registration_builder is None or _registration_phrase is None:
        return {"ok": False, "error": "No pending registration flow"}

    try:
        # Wait for approval (short timeout — the frontend will poll)
        builder = _registration_builder.wait_for_approval()

        if builder is not None:
            # Approval received — register to derive AppKey
            sdk = builder.register(_registration_phrase)
            app_key = sdk.app_key()

            # Persist the AppKey
            _save_app_key(app_key)

            # Update global state
            _sdk = sdk
            _demo_mode = False
            _demo_reason = ""

            # Securely discard the recovery phrase
            _registration_phrase = None
            _registration_builder = None

            logger.info("Sia registration completed successfully")
            return {"ok": True, "status": "approved"}

        # Still pending
        return {"ok": True, "status": "pending"}

    except Exception as e:
        logger.warning(f"Sia approval check failed (will retry): {e}")
        return {"ok": True, "status": "pending"}


def reset_registration():
    """Reset registration flow state."""
    global _registration_builder, _registration_phrase
    _registration_builder = None
    _registration_phrase = None


async def disconnect():
    """Disconnect from Sia and remove persisted key."""
    global _sdk, _demo_mode, _demo_reason
    _sdk = None
    _demo_mode = True
    _demo_reason = "Disconnected by user"
    reset_registration()
    _delete_app_key()


def get_status() -> dict:
    """Get current Sia connection status."""
    return {
        "connected": _sdk is not None and not _demo_mode,
        "demo": _demo_mode,
        "reason": _demo_reason if _demo_mode else None,
        "indexer_url": _indexer_url,
    }


def is_ready() -> bool:
    """Check if Sia SDK is ready for uploads."""
    return _sdk is not None and not _demo_mode


# ── Key Persistence ──────────────────────────────────────────────────────

def _load_app_key() -> Optional[AppKey]:
    """Load the persisted AppKey from disk."""
    try:
        key_path = Path(settings.sia_key_path)
        if not key_path.exists():
            return None
        hex_key = key_path.read_text().strip()
        key_bytes = bytes.fromhex(hex_key)
        return AppKey(key_bytes)
    except Exception as e:
        logger.warning(f"Failed to load AppKey: {e}")
        return None


def _save_app_key(app_key: AppKey):
    """Persist the AppKey to disk as hex."""
    try:
        key_path = Path(settings.sia_key_path)
        key_path.parent.mkdir(parents=True, exist_ok=True)
        key_path.write_text(app_key.key.hex())
        logger.info(f"AppKey saved to {key_path}")
    except Exception as e:
        logger.error(f"Failed to save AppKey: {e}")


def _delete_app_key():
    """Remove the persisted AppKey from disk."""
    try:
        key_path = Path(settings.sia_key_path)
        if key_path.exists():
            key_path.unlink()
    except Exception:
        pass