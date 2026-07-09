"""
URL Import API router.

Handles importing videos from YouTube and other web sources via URL.
The flow is:
  1. Receive a video URL from the frontend
  2. Extract video info and validate it via yt-dlp
  3. Download the video using yt-dlp
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

import yt_dlp
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models import Job, PipelineStep, SiaLog
from app.services import sia_client
from app.services.pipeline_orchestrator import run_pipeline_async

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["url-import"])

# ── Request / Response Schemas ──────────────────────────────────────────

class UrlImportRequest(BaseModel):
    url: str = Field(..., description="Video URL (YouTube, etc.)")


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


class CookiesStatusResponse(BaseModel):
    hasCookies: bool = Field(alias="hasCookies")
    cookiePath: str = Field(alias="cookiePath")
    cookieSize: int = Field(alias="cookieSize")


# ── Helpers ─────────────────────────────────────────────────────────────

SUPPORTED_DOMAINS = {
    "youtube.com", "youtu.be", "www.youtube.com",
    "m.youtube.com", "music.youtube.com",
    "vimeo.com", "www.vimeo.com",
    "dailymotion.com", "www.dailymotion.com",
    "tiktok.com", "www.tiktok.com",
    "x.com", "twitter.com", "www.x.com", "www.twitter.com",
    "instagram.com", "www.instagram.com",
    "facebook.com", "www.facebook.com",
    "reddit.com", "www.reddit.com",
}

def _get_ytdlp_opts() -> dict:
    """Build yt-dlp options, including cookies if configured."""
    opts = {
        "quiet": True,
        "no_warnings": True,
        "extract_flat": "discard",
    }
    cookies_path = settings.yt_dlp_cookies
    if cookies_path and Path(cookies_path).exists():
        opts["cookiefile"] = cookies_path
        logger.info(f"Using yt-dlp cookies from: {cookies_path}")
    elif cookies_path:
        logger.warning(f"yt-dlp cookies file not found: {cookies_path}")
    return opts


def _is_supported_url(url: str) -> bool:
    """Check if the URL is from a supported source."""
    try:
        from urllib.parse import urlparse
        parsed = urlparse(url)
        domain = parsed.netloc.lower()
        # Strip port if present
        if ":" in domain:
            domain = domain.split(":")[0]
        # Strip www prefix for matching
        return domain in SUPPORTED_DOMAINS
    except Exception:
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
        return "Invalid URL format. Please enter a valid video URL (e.g., https://www.youtube.com/watch?v=...)."

    if not _is_supported_url(url):
        return "This URL source is not supported. Supported sources: YouTube, Vimeo, Dailymotion, TikTok, X/Twitter, Instagram, Facebook, Reddit."

    return None


def _extract_info(url: str) -> dict:
    """Extract video info using yt-dlp."""
    opts = _get_ytdlp_opts()
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=False)
        return {
            "title": info.get("title", "Untitled"),
            "duration": info.get("duration"),
            "uploader": info.get("uploader") or info.get("channel") or info.get("creator"),
            "thumbnail": info.get("thumbnail"),
            "webpage_url": info.get("webpage_url") or url,
            "ext": info.get("ext", "mp4"),
        }


def _download_video(url: str, output_path: Path) -> tuple[Path, dict]:
    """
    Download video using yt-dlp.
    Returns (downloaded_file_path, info_dict).
    """
    # Use a temporary filename pattern
    temp_template = output_path / "%(id)s.%(ext)s"

    opts = {
        **_get_ytdlp_opts(),
        "outtmpl": str(temp_template),
        "format": "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
        "merge_output_format": "mp4",
        "postprocessors": [{
            "key": "FFmpegVideoConvertor",
            "preferedformat": "mp4",
        }],
    }

    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=True)
        # Determine the actual file path
        video_id = info.get("id", uuid.uuid4().hex[:12])
        ext = "mp4"  # We force mp4 via merge_output_format
        filename = f"{video_id}.{ext}"
        filepath = output_path / filename

        # If yt-dlp created the file with a different extension, find it
        if not filepath.exists():
            for f in output_path.iterdir():
                if f.stem == video_id and f.suffix in (".mp4", ".mkv", ".webm", ".mov"):
                    filepath = f
                    break

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

            db.add(SiaLog(
                job_id=job_id,
                step="sia_upload_source",
                passed=True,
                message=f"Source video uploaded to Sia: {sia_object_id}",
            ))

            logger.info(f"Source video uploaded to Sia for job {job_id}: {sia_object_id}")
            return {"sia_object_id": sia_object_id, "sia_status": "ready", "demo": False}

        except Exception as e:
            error_msg = f"Sia upload failed: {str(e)}"
            logger.error(error_msg)
            db.add(SiaLog(
                job_id=job_id,
                step="sia_upload_source",
                passed=False,
                message=error_msg,
            ))

    # Demo mode fallback
    demo_hash = f"demo-sia-{job_id}"
    db.add(SiaLog(
        job_id=job_id,
        step="sia_upload_source",
        passed=True,
        message=f"Demo: Source video stored with hash {demo_hash}",
    ))
    logger.info(f"Demo Sia upload for job {job_id}: {demo_hash}")
    return {"sia_object_id": demo_hash, "sia_status": "ready", "demo": True}


# ── Cookies Endpoints ───────────────────────────────────────────────────

@router.get("/url-import/cookies")
async def get_cookies_status():
    """
    GET /api/url-import/cookies

    Check whether YouTube cookies have been uploaded and are valid.
    Returns the status, path, and size of the cookies file.
    """
    cookie_path = Path(settings.yt_dlp_cookies) if settings.yt_dlp_cookies else None
    exists = cookie_path is not None and cookie_path.exists()
    size = cookie_path.stat().st_size if exists else 0

    return CookiesStatusResponse(
        hasCookies=exists,
        cookiePath=str(cookie_path) if cookie_path else "",
        cookieSize=size,
    )


@router.post("/url-import/cookies")
async def upload_cookies(file: UploadFile = File(...)):
    """
    POST /api/url-import/cookies

    Upload a cookies.txt file exported from the browser.
    Saves it to the path configured in YT_DLP_COOKIES.
    """
    if not settings.yt_dlp_cookies:
        raise HTTPException(
            status_code=500,
            detail="YT_DLP_COOKIES path is not configured in the server backend.",
        )

    cookie_path = Path(settings.yt_dlp_cookies)

    # Validate the uploaded file looks like a Netscape cookies file
    content = await file.read()
    if not content.strip():
        raise HTTPException(status_code=400, detail="Uploaded cookies file is empty.")

    decoded = content.decode("utf-8", errors="replace")

    # Check that it looks like a valid cookies file (Netscape format)
    if not any(line.strip().startswith((".youtube.com", "youtube.com", ".google.com", "#")) for line in decoded.splitlines()):
        # It might still be valid — let a few lines through, but warn if totally unrecognizable
        first_line = decoded.splitlines()[0] if decoded.splitlines() else ""
        if not first_line.startswith("#") and "youtube" not in decoded.lower():
            raise HTTPException(
                status_code=400,
                detail="The uploaded file does not appear to be a valid cookies.txt file. "
                       "Export from your browser using the 'Get cookies.txt LOCALLY' extension.",
            )

    # Ensure parent directory exists
    cookie_path.parent.mkdir(parents=True, exist_ok=True)

    # Write the cookies file
    cookie_path.write_bytes(content)
    logger.info(f"YouTube cookies uploaded ({len(content)} bytes) to {cookie_path}")

    return {
        "ok": True,
        "message": f"Cookies saved ({len(content)} bytes).",
        "size": len(content),
    }


# ── URL Import Endpoints ────────────────────────────────────────────────

@router.post("/url-import/info")
async def fetch_url_info(
    req: UrlImportRequest,
):
    """
    POST /api/url-import/info

    Fetch metadata about a video URL without downloading.
    Returns title, duration, uploader, thumbnail, etc.
    Used by the frontend to confirm the video before import.
    """
    url = req.url.strip()

    # Validate URL
    error = _validate_url(url)
    if error:
        raise HTTPException(status_code=400, detail=error)

    try:
        # Run yt-dlp info extraction in a thread to avoid blocking
        loop = asyncio.get_event_loop()
        info = await loop.run_in_executor(None, _extract_info, url)

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

    Import a video from a URL (YouTube, etc.):
      1. Validate URL
      2. Download the video via yt-dlp
      3. Create a Job record
      4. Upload to Sia Network
      5. Save locally
      6. Trigger pipeline
      7. Return job info
    """
    url = req.url.strip()

    # Validate URL
    error = _validate_url(url)
    if error:
        raise HTTPException(status_code=400, detail=error)

    # Create output directory
    download_dir = settings.upload_path / "url_imports"
    download_dir.mkdir(parents=True, exist_ok=True)

    # ── Step 1: Download the video ────────────────────────────────────
    try:
        loop = asyncio.get_event_loop()

        logger.info(f"Starting download for URL: {url}")

        # Extract info first (lightweight)
        info = await loop.run_in_executor(None, _extract_info, url)
        title = info["title"]
        duration = info["duration"]
        uploader = info["uploader"]

        logger.info(f"URL resolved: title='{title}', duration={duration}s")

        # Download the video (heavy operation, run in thread)
        download_path, download_info = await loop.run_in_executor(
            None, _download_video, url, download_dir
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

    db.add(PipelineStep(
        job_id=job_id,
        stage="sia_upload",
        status="running",
        progress_pct=10,
        message="Uploading source video to Sia Network...",
        started_at=now,
    ))

    await db.flush()
    logger.info(f"Job {job_id} created for URL import: '{title}' ({file_size} bytes)")

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
            step.message = f"Source video stored on Sia: {sia_result['sia_object_id'][:16]}..."
            step.completed_at = datetime.now(timezone.utc)

        await db.flush()
        logger.info(f"Sia upload complete for job {job_id}: {sia_result['sia_object_id']}")

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

    db.add(PipelineStep(
        job_id=job_id,
        stage="transcribe",
        status="pending",
        progress_pct=0,
        message="Waiting for transcription...",
    ))

    await db.commit()

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