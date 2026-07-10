"""
URL Import API router.

Handles importing videos from direct media URLs only (no YouTube/Vimeo/etc.).
The flow is:
  1. Receive a video URL from the frontend
  2. Validate it's a direct media URL (video/audio file)
  3. Download the video via HTTP stream
  4. Upload to Sia Network
  5. Save locally
  6. Create job and trigger pipeline
  7. Return the job_id
"""

import asyncio
import json
import logging
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models import AppSettings, Job, PipelineStep, SiaLog
from app.services import sia_client
from app.services.pipeline_orchestrator import run_pipeline_async

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["url-import"])

# ── Request / Response Schemas ──────────────────────────────────────────


class UrlImportRequest(BaseModel):
    url: str = Field(..., description="Direct media URL")


class UrlImportResponse(BaseModel):
    jobId: str = Field(alias="jobId")
    filename: str
    title: str
    sizeBytes: int
    durationSeconds: Optional[int] = None
    siaObjectId: Optional[str] = None
    siaStatus: str
    status: str


class UrlInfoResponse(BaseModel):
    title: str
    durationSeconds: Optional[int] = None
    uploader: Optional[str] = None
    thumbnail: Optional[str] = None
    webpageUrl: str = Field(alias="webpageUrl")
    isValid: bool = Field(alias="isValid")
    warning: Optional[str] = None


# ── Helpers ─────────────────────────────────────────────────────────────

# File extensions we'll treat as a direct media link
DIRECT_MEDIA_EXTENSIONS = {
    ".mp4",
    ".webm",
    ".mov",
    ".mkv",
    ".m4v",
    ".avi",
    ".mp3",
    ".m4a",
    ".wav",
    ".ogg",
}


def _has_direct_media_extension(url: str) -> bool:
    """Check if the URL path ends in a known media file extension."""
    try:
        from urllib.parse import urlparse

        path = urlparse(url).path.lower()
        return any(path.endswith(ext) for ext in DIRECT_MEDIA_EXTENSIONS)
    except Exception:
        return False


def _get_media_type_from_url_params(url: str) -> Optional[str]:
    """
    Check URL query parameters for a known media-type indicator.
    Some CDNs (e.g., Google Video, CloudFront, Akamai) embed the MIME type
    as a query parameter like ?mime=video/mp4 or ?format=mp4.
    """
    from urllib.parse import parse_qs, urlparse

    try:
        params = parse_qs(urlparse(url).query)
    except Exception:
        return None

    # Check for explicit mime/content-type parameter
    for param in ("mime", "content-type", "content_type", "type", "mediatype"):
        values = params.get(param, [])
        for val in values:
            val = val.lower()
            if val.startswith("video/") or val.startswith("audio/"):
                return val

    # Check for format parameter that maps to known video/audio extensions
    format_param = params.get("format", [None])[0]
    if format_param:
        fmt = format_param.lower().strip(" .")
        ext_to_type = {
            "mp4": "video/mp4",
            "webm": "video/webm",
            "mov": "video/quicktime",
            "mkv": "video/x-matroska",
            "m4v": "video/mp4",
            "avi": "video/x-msvideo",
            "mp3": "audio/mpeg",
            "m4a": "audio/mp4",
            "wav": "audio/wav",
            "ogg": "audio/ogg",
        }
        if fmt in ext_to_type:
            return ext_to_type[fmt]

    return None


def _probe_content_type(url: str) -> Optional[str]:
    """
    Probes a URL to detect its Content-Type via HTTP.
    Uses multiple strategies to handle various CDN behaviours:
      1. HEAD with limited redirect following (check each step)
      2. Ranged GET (bytes=0-0) — many servers reject HEAD but serve ranged GETs
      3. Initial 302/301 redirect response headers (some embed Content-Type there)
    """
    import httpx

    # ── Strategy 1: HEAD request, check each redirect's headers ──────
    try:
        with httpx.Client(follow_redirects=False, timeout=8.0) as client:
            resp = client.head(url)
            # Check every response in the redirect chain
            for redirect_resp in resp.history:
                ct = redirect_resp.headers.get("content-type", "").lower()
                if ct.startswith("video/") or ct.startswith("audio/"):
                    return ct
            # Also check the final response
            ct = resp.headers.get("content-type", "").lower()
            if ct.startswith("video/") or ct.startswith("audio/"):
                return ct
    except Exception:
        pass

    # ── Strategy 2: Ranged GET (bytes=0-0) ──────────────────────────
    # Some CDNs reject HEAD but serve ranged GETs with Content-Type.
    try:
        with httpx.Client(follow_redirects=True, timeout=10.0) as client:
            resp = client.get(url, headers={"Range": "bytes=0-0"})
            ct = resp.headers.get("content-type", "").lower()
            if ct.startswith("video/") or ct.startswith("audio/"):
                return ct
    except Exception:
        pass

    # ── Strategy 3: Full GET, stream only the first chunk ───────────
    # Some servers only set Content-Type on actual content delivery.
    try:
        with httpx.Client(follow_redirects=True, timeout=10.0) as client:
            with client.stream("GET", url) as resp:
                ct = resp.headers.get("content-type", "").lower()
                if ct.startswith("video/") or ct.startswith("audio/"):
                    return ct
                # Read a tiny bit to force headers from chunked responses
                for _ in resp.iter_bytes(chunk_size=1):
                    break
                # Check again after reading (some servers send ct with data)
                ct = resp.headers.get("content-type", "").lower()
                if ct.startswith("video/") or ct.startswith("audio/"):
                    return ct
    except Exception:
        pass

    return None


def _is_session_bound_cdn_url(url: str) -> bool:
    """
    Detect CDN URLs that are locked to the browser session that generated
    them — most notably YouTube's googlevideo.com videoplayback URLs.

    These embed a client-IP lock (`mip`), an expiring timestamp (`expire`),
    and a cryptographic signature (`sig`/`signature`) that are checked
    against the requester. A server making the same request from a
    different IP always gets a 403, no matter what headers or retries
    are used, so there's no point attempting (or re-attempting) a download.
    """
    from urllib.parse import parse_qs, urlparse

    try:
        parsed = urlparse(url)
        host = parsed.netloc.lower()
        params = parse_qs(parsed.query)
    except Exception:
        return False

    if host.endswith("googlevideo.com"):
        return True

    has_ip_lock = "mip" in params or "ip" in params
    has_signature = "sig" in params or "signature" in params or "lsig" in params
    has_expiry = "expire" in params

    return has_ip_lock and has_signature and has_expiry


_SESSION_BOUND_URL_MESSAGE = (
    "This URL is a session-limited streaming link — it's tied to the IP "
    "address of the browser that generated it and expires shortly after. "
    "It can't be downloaded from a server with a different IP, so the "
    "download will always fail with a 403, regardless of headers or "
    "retries. Try using a direct file link from a public host instead "
    "(e.g., one ending in .mp4), or download the file to your own device "
    "first and upload it directly."
)


def _looks_like_direct_media(url: str) -> bool:
    """
    Determine whether a URL points directly at a media file.
    Strategy (in order of cost):
      1. Cheap extension check on the URL path
      2. Check URL query parameters for MIME type indicators
      3. HTTP probe (HEAD with multi-strategy fallback)
    """
    if _has_direct_media_extension(url):
        return True

    media_type = _get_media_type_from_url_params(url)
    if media_type is not None:
        return True

    media_type = _probe_content_type(url)
    if media_type is not None:
        return True

    return False


def _validate_url(url: str) -> Optional[str]:
    """Validate the URL format. Returns error message or None."""
    if not url or not url.strip():
        return "No URL provided."

    url = url.strip()

    # Basic URL validation
    url_pattern = re.compile(
        r"^https?://"  # http:// or https://
        r"([\w.-]+)"  # domain
        r"(\.[\w.-]+)+"  # TLD
        r"[/\w\.\-~:@!#$%&'()*+,;=]*"  # path
        r"(\?[\w\.\-~:@!#$%&'()*+,;=/]*)?$"  # query string
    )
    if not url_pattern.match(url):
        return "Invalid URL format. Please enter a valid video URL."

    if _looks_like_direct_media(url):
        return None

    return "This URL does not appear to be a direct link to a video or audio file. Please provide a direct media URL (e.g., a link ending in .mp4, .webm, .mov, etc.)."


def _extract_direct_media_info(url: str) -> dict:
    """
    Build an info dict for a direct media URL.
    Duration is left as None — the pipeline's transcription/analysis step
    will pick it up from the file itself once downloaded.

    For extensionless URLs (e.g., CDN streaming URLs), we extract metadata
    from query parameters like ?title=...&mime=video%2Fmp4.
    """
    from urllib.parse import parse_qs, unquote, urlparse

    parsed = urlparse(url)
    params = parse_qs(parsed.query)
    path = parsed.path

    # ── Try to get a meaningful title ─────────────────────────────────
    title = None
    if "title" in params:
        title = unquote(params["title"][0])
    if not title:
        filename = unquote(path.rsplit("/", 1)[-1]) if path else None
        if filename and filename != "videoplayback" and "." in filename:
            title = filename.rsplit(".", 1)[0]
        elif filename and filename != "videoplayback":
            title = filename
    if not title:
        # Fall back to a readable name from the domain + truncated path
        domain = parsed.netloc.replace("www.", "")
        path_part = path.strip("/").replace("/", "-") if path else "video"
        title = f"{domain}-{path_part}" if path_part else domain

    # ── Determine extension ───────────────────────────────────────────
    ext = "mp4"  # default fallback
    if "." in path:
        path_ext = path.rsplit(".", 1)[-1].lower()
        if path_ext in {e.lstrip(".") for e in DIRECT_MEDIA_EXTENSIONS}:
            ext = path_ext

    # Check query param for MIME type to guess extension
    if not ext:
        media_type = _get_media_type_from_url_params(url)
        if media_type:
            mime_to_ext = {
                "video/mp4": "mp4",
                "video/webm": "webm",
                "video/quicktime": "mov",
                "video/x-matroska": "mkv",
                "video/x-msvideo": "avi",
                "audio/mpeg": "mp3",
                "audio/mp4": "m4a",
                "audio/wav": "wav",
                "audio/ogg": "ogg",
            }
            ext = mime_to_ext.get(media_type, "mp4")

    # ── Clean up title (remove excessive truncation markers) ──────────
    if title:
        title = title.replace("+", " ").strip()
        # Truncate overly long titles (some CDNs embed long params)
        if len(title) > 120:
            title = title[:120].rsplit(" ", 1)[0]

    return {
        "title": title or "Untitled",
        "duration": None,
        "uploader": None,
        "thumbnail": None,
        "webpage_url": url,
        "ext": ext,
    }


# Realistic browser headers to avoid CDN blocks
_DOWNLOAD_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/125.0.0.0 Safari/537.36"
    ),
    "Accept": "video/webm,video/mp4,video/*;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Sec-Fetch-Mode": "no-cors",
    "Sec-Fetch-Dest": "video",
    "Origin": "https://www.youtube.com",
    "Referer": "https://www.youtube.com/",
    "Connection": "keep-alive",
}


def _download_direct_media(url: str, output_path: Path) -> tuple[Path, dict]:
    """
    Stream a direct media URL straight to disk over HTTP.
    Uses browser-like headers to avoid CDN blocks, handles redirect chains
    manually so we can retry with alternative CDN edges when one returns 403.

    Returns (downloaded_file_path, info_dict).
    """
    import httpx

    # Don't even try — IP-locked/session-bound URLs (e.g. googlevideo.com)
    # will 403 on every single attempt, so skip straight to a clear error
    # instead of burning time on retries that can't possibly succeed.
    if _is_session_bound_cdn_url(url):
        raise Exception(_SESSION_BOUND_URL_MESSAGE)

    info = _extract_direct_media_info(url)
    file_id = uuid.uuid4().hex[:12]
    ext = (
        info["ext"]
        if info["ext"]
        in {"mp4", "webm", "mov", "mkv", "m4v", "avi", "mp3", "m4a", "wav", "ogg"}
        else "mp4"
    )
    filepath = output_path / f"{file_id}.{ext}"

    # Collect all unique URLs from the redirect chain for fallback retries
    candidate_urls: list[str] = [url]

    with httpx.Client(
        follow_redirects=False,
        timeout=httpx.Timeout(30.0, read=None),
        headers=_DOWNLOAD_HEADERS,
    ) as client:
        current_url = url
        last_error: Exception | None = None

        # Try up to all candidates + 3 extra attempts
        for attempt in range(len(candidate_urls) + 3):
            if attempt < len(candidate_urls):
                current_url = candidate_urls[attempt]
            elif attempt == len(candidate_urls):
                # After exhausting explicit candidates, try original URL fresh
                current_url = url

            try:
                # Start streaming with no redirect following
                with client.stream("GET", current_url) as resp:
                    # Collect redirect chain URLs from the response history
                    for redirect_resp in resp.history:
                        loc = redirect_resp.headers.get("location")
                        if loc and loc not in candidate_urls:
                            candidate_urls.append(loc)

                    resp.raise_for_status()
                    with open(filepath, "wb") as f:
                        for chunk in resp.iter_bytes(chunk_size=1024 * 1024):
                            f.write(chunk)

                    info["id"] = file_id
                    return filepath, info

            except httpx.HTTPStatusError as e:
                last_error = e
                if e.response.status_code == 403:
                    logger.warning(
                        f"Download attempt {attempt + 1} got 403 for CDN edge, "
                        f"trying next candidate... "
                        f"({len(candidate_urls)} candidates available)"
                    )
                    # Add new redirect locations we may have missed
                    for redirect_resp in e.response.history:
                        loc = redirect_resp.headers.get("location")
                        if loc and loc not in candidate_urls:
                            candidate_urls.append(loc)
                    continue
                else:
                    raise
            except Exception:
                raise

    # If we exhausted all attempts, raise with context
    raise Exception(
        f"Download failed after {len(candidate_urls)} CDN redirects — "
        f"all returned 403 Forbidden. "
        f"This typically happens because the video URL is IP-restricted "
        f"(tied to the browser/client that generated it) and cannot be "
        f"downloaded from the server. "
        f"Try using a direct media URL (e.g., ending in .mp4) from a "
        f"publicly accessible host instead. "
        f"Last error: {last_error}"
    ) from last_error


async def _upload_to_sia(
    job_id: str,
    file_data: bytes,
    filename: str,
    db: AsyncSession,
) -> dict:
    """
    Upload the downloaded video to Sia Network immediately.
    Reuses the same logic as the file upload router.
    """
    sdk = await sia_client.get_sdk()

    if sdk is not None:
        try:
            from sia_storage import PinnedObject

            obj = PinnedObject()
            uploaded = sdk.upload(obj, file_data)
            sia_object_id = uploaded.id()

            try:
                pinned = sdk.object(sia_object_id)
                sdk.pin_object(pinned)
            except Exception as e:
                logger.warning(f"Failed to pin Sia object {sia_object_id}: {e}")

            db.add(
                SiaLog(
                    job_id=job_id,
                    step="sia_upload_source",
                    passed=True,
                    message=f"Source video uploaded to Sia: {sia_object_id}",
                )
            )

            logger.info(
                f"Source video uploaded to Sia for job {job_id}: {sia_object_id}"
            )
            return {
                "sia_object_id": sia_object_id,
                "sia_status": "ready",
                "demo": False,
            }

        except Exception as e:
            error_msg = f"Sia upload failed: {str(e)}"
            logger.error(error_msg)
            db.add(
                SiaLog(
                    job_id=job_id,
                    step="sia_upload_source",
                    passed=False,
                    message=error_msg,
                )
            )

    # Demo mode fallback
    demo_hash = f"demo-sia-{job_id}"
    db.add(
        SiaLog(
            job_id=job_id,
            step="sia_upload_source",
            passed=True,
            message=f"Demo: Source video stored with hash {demo_hash}",
        )
    )
    logger.info(f"Demo Sia upload for job {job_id}: {demo_hash}")
    return {"sia_object_id": demo_hash, "sia_status": "ready", "demo": True}


# ── URL Import Endpoints ────────────────────────────────────────────────


@router.post("/url-import/info")
async def fetch_url_info(
    req: UrlImportRequest,
):
    """
    POST /api/url-import/info

    Fetch metadata about a direct media URL without downloading.
    Returns title, duration, uploader, thumbnail, etc.
    Used by the frontend to confirm the URL before import.
    """
    url = req.url.strip()

    # Validate URL is a direct media link
    if not _looks_like_direct_media(url):
        raise HTTPException(
            status_code=400,
            detail="This URL does not appear to be a direct link to a video or audio file. Please provide a direct media URL (e.g., a link ending in .mp4, .webm, .mov, etc.).",
        )

    try:
        info = _extract_direct_media_info(url)

        return UrlInfoResponse(
            title=info["title"],
            durationSeconds=info["duration"],
            uploader=info["uploader"],
            thumbnail=info["thumbnail"],
            webpageUrl=info["webpage_url"],
            isValid=True,
            warning=(
                _SESSION_BOUND_URL_MESSAGE if _is_session_bound_cdn_url(url) else None
            ),
        )

    except Exception as e:
        logger.error(f"URL info extraction failed for {url}: {e}")
        raise HTTPException(
            status_code=400,
            detail=f"Could not fetch video info. Make sure the URL is valid and the video is accessible. Error: {str(e)}",
        )


@router.post("/url-import", response_model=UrlImportResponse)
async def import_from_url(
    req: UrlImportRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    POST /api/url-import

    Import a video from a direct media URL:
      1. Validate URL
      2. Download the video via HTTP stream
      3. Create a Job record
      4. Upload to Sia Network
      5. Save locally
      6. Trigger pipeline
      7. Return job info
    """
    url = req.url.strip()

    # Validate URL is a direct media link
    if not _looks_like_direct_media(url):
        raise HTTPException(
            status_code=400,
            detail="This URL does not appear to be a direct link to a video or audio file. Please provide a direct media URL (e.g., a link ending in .mp4, .webm, .mov, etc.).",
        )

    # Create output directory
    download_dir = settings.upload_path / "url_imports"
    download_dir.mkdir(parents=True, exist_ok=True)

    # ── Step 1: Download the video ────────────────────────────────────
    try:
        loop = asyncio.get_event_loop()

        logger.info(f"Starting download for URL: {url}")

        # Extract info first (lightweight)
        info = _extract_direct_media_info(url)
        title = info["title"]
        duration = info["duration"]

        logger.info(f"URL resolved: title='{title}'")

        # Download the video (heavy operation, run in thread)
        download_path, download_info = await loop.run_in_executor(
            None, _download_direct_media, url, download_dir
        )

        file_data = download_path.read_bytes()
        file_size = len(file_data)
        filename = download_path.name

        logger.info(f"Download complete for '{title}': {filename} ({file_size} bytes)")

    except Exception as e:
        logger.error(f"Download failed for URL {url}: {e}")
        raise HTTPException(
            status_code=400,
            detail=f"Could not download video from the provided URL. Error: {str(e)}",
        )

    # ── Step 2: Create Job ────────────────────────────────────────────
    job_id = f"job_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc)

    try:
        job = Job(
            id=job_id,
            status="uploading",
            source_filename=filename,
            source_url=url,
            duration_seconds=duration,
            sia_status="pending",
            created_at=now,
            updated_at=now,
        )
        db.add(job)

        db.add(
            PipelineStep(
                job_id=job_id,
                stage="sia_upload",
                status="running",
                progress_pct=10,
                message="Uploading source video to Sia Network...",
                started_at=now,
            )
        )

        await db.flush()
        logger.info(
            f"Job {job_id} created for URL import: '{title}' ({file_size} bytes)"
        )
    except Exception as e:
        await db.rollback()
        logger.error(f"Failed to create job record for URL {url}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Could not create the job record after downloading the video. Error: {str(e)}",
        )

    # ── Step 3: Upload to Sia ─────────────────────────────────────────
    try:
        sia_result = await _upload_to_sia(job_id, file_data, filename, db)

        job.source_sia_object_id = sia_result["sia_object_id"]
        job.sia_hash = sia_result["sia_object_id"]
        job.sia_status = sia_result["sia_status"]

        step_result = await db.execute(
            select(PipelineStep).where(
                PipelineStep.job_id == job_id,
                PipelineStep.stage == "sia_upload",
            )
        )
        step = step_result.scalar_one_or_none()
        if step:
            step.status = "complete"
            step.progress_pct = 100
            step.message = (
                f"Source video stored on Sia: {sia_result['sia_object_id'][:16]}..."
            )
            step.completed_at = datetime.now(timezone.utc)

        await db.flush()
        logger.info(
            f"Sia upload complete for job {job_id}: {sia_result['sia_object_id']}"
        )

    except Exception as e:
        logger.error(f"Sia upload failed for job {job_id}: {e}")
        step_result = await db.execute(
            select(PipelineStep).where(
                PipelineStep.job_id == job_id,
                PipelineStep.stage == "sia_upload",
            )
        )
        step = step_result.scalar_one_or_none()
        if step:
            step.status = "failed"
            step.progress_pct = 0
            step.message = f"Sia upload failed: {str(e)}"
            step.completed_at = datetime.now(timezone.utc)
        await db.flush()

    # ── Step 4: Save locally (already downloaded, just copy to uploads) ──
    try:
        local_path = settings.upload_path / f"{job_id}.mp4"
        local_path.parent.mkdir(parents=True, exist_ok=True)
        local_path.write_bytes(file_data)
        logger.info(f"Video saved locally for job {job_id}: {local_path}")
    except Exception as e:
        logger.error(f"Failed to save video locally for job {job_id}: {e}")

    # Cleanup the download temp file
    try:
        download_path.unlink(missing_ok=True)
    except Exception:
        pass

    # ── Step 5: Update job and trigger pipeline ───────────────────────
    job.status = "uploaded"
    job.updated_at = datetime.now(timezone.utc)

    db.add(
        PipelineStep(
            job_id=job_id,
            stage="transcribe",
            status="pending",
            progress_pct=0,
            message="Waiting for transcription...",
        )
    )

    try:
        await db.commit()
    except Exception as e:
        await db.rollback()
        logger.error(f"Failed to finalize job {job_id}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Video was downloaded and stored, but the job record could not be finalized. Error: {str(e)}",
        )

    # Trigger pipeline in background
    asyncio.create_task(run_pipeline_async(job_id))
    logger.info(f"Async pipeline started for job {job_id}")

    return UrlImportResponse(
        jobId=job_id,
        filename=filename,
        title=title,
        sizeBytes=file_size,
        durationSeconds=duration,
        siaObjectId=job.source_sia_object_id,
        siaStatus=job.sia_status,
        status=job.status,
    )
