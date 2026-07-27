"""
Clips API router.

Provides endpoints for serving extracted/rendered clip files to the frontend
for playback. Clips are served from:

  1. **Sia network** (primary) — via the Sia SDK, using the segment's
     `sia_object_id`.  The full object is downloaded and cached to a
     temporary file so that HTTP Range requests (required for HTML5 video
     seeking) can be satisfied efficiently.

  2. **Local filesystem** (fallback / fast-path) — if the segment's
     `clip_path` still exists on disk (e.g. the pipeline just finished and
     `sia_store` hasn't cleaned it up yet), it's served directly. This
     avoids an unnecessary download from Sia for recently-processed jobs.

Uses a custom `_range_file_response` function to properly support HTTP Range
requests (byte serving) required for HTML5 video seeking.  Starlette's
built-in `FileResponse` does NOT handle Range requests correctly.
"""

import logging
import os
import tempfile
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse, Response, StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Segment
from app.services import sia_client

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/jobs/{job_id}/clips", tags=["clips"])

# ── Sia download cache ────────────────────────────────────────────────────
# When a video is downloaded from Sia, it's cached on disk so subsequent
# range requests (for seeking) don't re-download the entire file from the
# Sia network each time.  The cache lives in a temp directory and is
# cleaned up on system reboot / temp dir cleanup.
_sia_cache_dir = Path(tempfile.mkdtemp(prefix="rebit_sia_cache_"))


async def _range_file_response(
    file_path: Path,
    request: Request,
    media_type: str = "video/mp4",
) -> Response:
    """
    Serve a file with proper HTTP Range (partial content) support.

    This is required for HTML5 <video> elements which send Range headers
    to seek within a video.  Starlette's built-in FileResponse does NOT
    handle Range requests correctly, causing 416 errors on video playback.

    Implements:
      - 200 full response (no Range header)
      - 206 partial content (single range)
      - 416 Range Not Satisfiable (invalid range), with Content-Range so
        the browser knows the actual file size and can retry.
    """
    file_size = file_path.stat().st_size

    range_header = request.headers.get("range")
    if range_header is None:
        # No range requested — serve the entire file
        async def _full_iter():
            with open(file_path, "rb") as f:
                while chunk := f.read(256 * 1024):
                    yield chunk

        return StreamingResponse(
            _full_iter(),
            media_type=media_type,
            headers={
                "Content-Length": str(file_size),
                "Accept-Ranges": "bytes",
            },
        )

    # Parse Range header: "bytes=start-end"
    if not range_header.startswith("bytes="):
        raise HTTPException(status_code=416, detail="Invalid range header")

    range_value = range_header[6:]  # strip "bytes="
    parts = range_value.split("-", 1)
    try:
        start = int(parts[0]) if parts[0] else 0
        end = int(parts[1]) if len(parts) > 1 and parts[1] else file_size - 1
    except (ValueError, IndexError):
        raise HTTPException(status_code=416, detail="Invalid range value")

    # Clamp / validate
    if start < 0:
        start = 0
    if end >= file_size:
        end = file_size - 1
    if start > end or start >= file_size:
        return Response(
            status_code=416,
            headers={
                "Content-Range": f"bytes */{file_size}",
                "Accept-Ranges": "bytes",
            },
        )

    content_length = end - start + 1

    async def _range_iter():
        with open(file_path, "rb") as f:
            f.seek(start)
            remaining = content_length
            while remaining > 0:
                chunk_size = min(256 * 1024, remaining)
                chunk = f.read(chunk_size)
                if not chunk:
                    break
                yield chunk
                remaining -= len(chunk)

    return StreamingResponse(
        _range_iter(),
        status_code=206,
        media_type=media_type,
        headers={
            "Content-Range": f"bytes {start}-{end}/{file_size}",
            "Content-Length": str(content_length),
            "Accept-Ranges": "bytes",
        },
    )


async def _fetch_and_cache_from_sia(
    segment_id: str,
    sia_object_id: str,
) -> Path:
    """
    Download a clip from the Sia network and cache it to a local temp file.

    Returns the path to the cached file.  This ensures that subsequent
    HTTP Range requests (video seeking) only pay the Sia download cost
    once per server lifetime.

    The cached file uses a deterministic name derived from the Sia object
    ID so that concurrent requests for the same clip don't re-download.
    """
    cache_path = _sia_cache_dir / f"{sia_object_id}.mp4"

    # If another request already cached this object, return immediately.
    # The cache uses atomic writes (write-to-temp, then rename), so
    # a non-empty file is guaranteed to be complete.
    if cache_path.exists() and cache_path.stat().st_size > 0:
        logger.info(f"Serving clip {segment_id} from Sia cache: {cache_path}")
        return cache_path

    # Download from Sia
    sdk = await sia_client.get_sdk()
    if sdk is None:
        raise HTTPException(
            status_code=503,
            detail="Sia is not connected",
        )

    logger.info(f"Downloading clip {segment_id} from Sia: {sia_object_id}")
    try:
        sia_obj = await sdk.object(sia_object_id)
        data = await sia_obj.data()
    except Exception as e:
        logger.error(f"Failed to fetch clip {segment_id} from Sia: {e}")
        raise HTTPException(
            status_code=502,
            detail=f"Failed to fetch clip from Sia: {str(e)}",
        )

    # Write to cache atomically (write to temp, then rename)
    temp_path = cache_path.with_suffix(f".{os.getpid()}.tmp")
    try:
        temp_path.write_bytes(data)
        temp_path.rename(cache_path)
    except Exception as e:
        logger.warning(f"Failed to cache Sia clip to disk: {e}")
        # Fall back to in-memory serving for this request (no caching)
        # by writing to a unique temp file that won't be reused
        fallback = _sia_cache_dir / f"{sia_object_id}_{os.getpid()}.mp4"
        fallback.write_bytes(data)
        return fallback

    logger.info(f"Cached clip {segment_id} at {cache_path} ({len(data)} bytes)")
    return cache_path


@router.get("/{segment_id}")
async def serve_clip(
    job_id: str,
    segment_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    GET /api/jobs/{job_id}/clips/{segment_id}

    Serves a clip video file for playback.  Tries the following sources
    in order:

      1. **Sia network** (primary) — if the segment has a `sia_object_id`
         and the Sia SDK is connected, the clip is downloaded from Sia,
         cached locally, and served with HTTP Range support.

      2. **Local filesystem** (fast-path fallback) — if the segment has a
         `clip_path` that still exists on disk (pipeline just finished), it
         is served directly for speed.

      3. **404** — no source available for this segment.

    Returns the video file with proper HTTP Range support for HTML5 video
    seeking (206 Partial Content responses).
    """
    # Fetch the segment
    result = await db.execute(
        select(Segment).where(
            Segment.id == segment_id,
            Segment.job_id == job_id,
        )
    )
    segment = result.scalar_one_or_none()

    if not segment:
        raise HTTPException(status_code=404, detail="Segment not found")

    # ──────────────────────────────────────────────────────────────────
    # Strategy 1: Serve from Sia network (primary persistent storage)
    # ──────────────────────────────────────────────────────────────────
    if segment.sia_object_id:
        sdk = await sia_client.get_sdk()
        if sdk is not None:
            try:
                cache_path = await _fetch_and_cache_from_sia(
                    segment_id,
                    segment.sia_object_id,
                )
                return await _range_file_response(cache_path, request)
            except Exception as e:
                # Any failure here — including the HTTPException that
                # _fetch_and_cache_from_sia raises for "object not found" —
                # should fall through to the local filesystem fallback below
                # rather than aborting the request. A stale/wrong Sia object
                # ID shouldn't block playback when the file is still on disk.
                logger.error(f"Failed to serve clip {segment_id} from Sia: {e}")
                # Fall through to local filesystem fallback

    # ──────────────────────────────────────────────────────────────────
    # Strategy 2: Local filesystem (fast-path fallback / cache)
    # ──────────────────────────────────────────────────────────────────
    if segment.clip_path:
        clip_path = Path(segment.clip_path)
        if clip_path.exists() and clip_path.stat().st_size > 0:
            logger.info(f"Serving clip {segment_id} from local filesystem: {clip_path}")
            return await _range_file_response(clip_path, request)
        elif clip_path.exists():
            logger.warning(
                f"clip_path exists in DB but file is empty (likely a failed ffmpeg run): {clip_path}"
            )
        else:
            logger.warning(f"clip_path exists in DB but file not found: {clip_path}")

    # ──────────────────────────────────────────────────────────────────
    # No source available
    # ──────────────────────────────────────────────────────────────────
    raise HTTPException(
        status_code=404,
        detail="No clip file available for this segment",
    )


@router.get("/{segment_id}/download")
async def download_clip(
    job_id: str,
    segment_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    GET /api/jobs/{job_id}/clips/{segment_id}/download

    Downloads a clip file from Sia (or local filesystem) with
    ``Content-Disposition: attachment`` so the browser prompts the
    user to save the file rather than playing it inline.

    Sources tried in order:
      1. Sia network (primary persistent storage)
      2. Local filesystem (fast-path fallback)
      3. 404 — no source available
    """
    # Fetch the segment
    result = await db.execute(
        select(Segment).where(
            Segment.id == segment_id,
            Segment.job_id == job_id,
        )
    )
    segment = result.scalar_one_or_none()

    if not segment:
        raise HTTPException(status_code=404, detail="Segment not found")

    file_path: Path | None = None
    # Strategy 1: Sia network
    if segment.sia_object_id:
        sdk = await sia_client.get_sdk()
        if sdk is not None:
            try:
                file_path = await _fetch_and_cache_from_sia(
                    segment_id,
                    segment.sia_object_id,
                )
            except Exception as e:
                logger.warning(
                    f"Sia download failed for segment {segment_id}: {e}"
                )

    # Strategy 2: Local filesystem fallback
    if file_path is None and segment.clip_path:
        local = Path(segment.clip_path)
        if local.exists() and local.stat().st_size > 0:
            file_path = local

    if file_path is None:
        raise HTTPException(
            status_code=404,
            detail="No clip file available for this segment",
        )

    filename = f"clip-{segment_id}.mp4"
    return FileResponse(
        path=file_path,
        media_type="video/mp4",
        filename=filename,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )
