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


def _looks_like_direct_media(url: str) -> bool:
    """
    Determine whether a URL points directly at a media file.
    Tries a cheap extension check first, then falls back to a HEAD request
    and inspects Content-Type.
    """
    if _has_direct_media_extension(url):
        return True

    try:
        import httpx

        with httpx.Client(follow_redirects=True, timeout=8.0) as client:
            resp = client.head(url)
            content_type = resp.headers.get("content-type", "").lower()
            if content_type.startswith("video/") or content_type.startswith("audio/"):
                return True
            # Some CDNs don't respond well to HEAD (405/403) — retry with a
            # ranged GET so we don't download the whole file just to check.
            if resp.status_code in (405, 403, 501):
                resp = client.get(url, headers={"Range": "bytes=0-0"})
                content_type = resp.headers.get("content-type", "").lower()
                if content_type.startswith("video/") or content_type.startswith(
                    "audio/"
                ):
                    return True
    except Exception as e:
        logger.debug(f"Content-Type probe failed for {url}: {e}")

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
    """
    from urllib.parse import unquote, urlparse

    path = urlparse(url).path
    filename = unquote(path.rsplit("/", 1)[-1]) or "video"
    title = filename.rsplit(".", 1)[0] if "." in filename else filename
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "mp4"

    return {
        "title": title or "Untitled",
        "duration": None,
        "uploader": None,
        "thumbnail": None,
        "webpage_url": url,
        "ext": ext,
    }


def _download_direct_media(url: str, output_path: Path) -> tuple[Path, dict]:
    """
    Stream a direct media URL straight to disk over HTTP.
    Returns (downloaded_file_path, info_dict).
    """
    import httpx

    info = _extract_direct_media_info(url)
    file_id = uuid.uuid4().hex[:12]
    ext = (
        info["ext"]
        if info["ext"]
        in {"mp4", "webm", "mov", "mkv", "m4v", "avi", "mp3", "m4a", "wav", "ogg"}
        else "mp4"
    )
    filepath = output_path / f"{file_id}.{ext}"

    with httpx.Client(
        follow_redirects=True, timeout=httpx.Timeout(30.0, read=None)
    ) as client:
        with client.stream("GET", url) as resp:
            resp.raise_for_status()
            with open(filepath, "wb") as f:
                for chunk in resp.iter_bytes(chunk_size=1024 * 1024):
                    f.write(chunk)

    info["id"] = file_id
    return filepath, info


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