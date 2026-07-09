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
from app.models import AppSettings, Job, PipelineStep, SiaLog
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
    updatedAt: Optional[str] = Field(default=None, alias="updatedAt")


# ── Helpers ─────────────────────────────────────────────────────────────

SUPPORTED_DOMAINS = {
    "youtube.com",
    "youtu.be",
    "www.youtube.com",
    "m.youtube.com",
    "music.youtube.com",
    "vimeo.com",
    "www.vimeo.com",
    "dailymotion.com",
    "www.dailymotion.com",
    "tiktok.com",
    "www.tiktok.com",
    "x.com",
    "twitter.com",
    "www.x.com",
    "www.twitter.com",
    "instagram.com",
    "www.instagram.com",
    "facebook.com",
    "www.facebook.com",
    "reddit.com",
    "www.reddit.com",
}


def _cookies_path() -> Path:
    """
    Resolve the on-disk path for the YouTube cookies file.

    The default location is under the app's upload directory
    (UPLOAD_DIR/cookies/youtube_cookies.txt), which is where the
    settings-page upload endpoint always writes cookies.

    If the YT_DLP_COOKIES env var is set AND the file exists at that
    location, it takes precedence for backward compatibility (e.g. a
    manually-placed cookies file outside the data dir). If the env var
    points to a non-existent file, we silently fall back to the default
    path so that the settings page upload still works.
    """
    if settings.yt_dlp_cookies:
        env_path = Path(settings.yt_dlp_cookies)
        if env_path.exists():
            return env_path
        logger.debug(
            "YT_DLP_COOKIES=%s set but file not found, "
            "falling back to upload-path default",
            settings.yt_dlp_cookies,
        )
    return settings.upload_path / "cookies" / "youtube_cookies.txt"


class _YtdlpDiagnosticLogger:
    """
    Captures yt-dlp's internal debug/warning/error lines so we can surface
    the *real* reason a download failed (e.g. "PO Token Providers: none
    available") instead of just the generic "No video formats found!"
    exception message.
    """

    def __init__(self):
        self.lines: list[str] = []

    def debug(self, msg):
        self.lines.append(str(msg))

    def info(self, msg):
        self.lines.append(str(msg))

    def warning(self, msg):
        self.lines.append(f"WARNING: {msg}")

    def error(self, msg):
        self.lines.append(f"ERROR: {msg}")

    def pot_diagnostics(self) -> Optional[str]:
        """Pull out any PO-token-related lines, which are the most useful
        signal when format resolution fails."""
        pot_lines = [
            l for l in self.lines if "pot" in l.lower() or "po token" in l.lower()
        ]
        return "; ".join(pot_lines[-5:]) if pot_lines else None


def _get_ytdlp_opts(
    diagnostic_logger: Optional["_YtdlpDiagnosticLogger"] = None,
) -> dict:
    """Build yt-dlp options, including cookies if configured."""
    # YouTube now requires a PO (Proof-of-Origin) token for GVS/streaming
    # requests on essentially every client — cookies alone no longer get
    # you past format resolution. We point yt-dlp at a bgutil-ytdlp-pot-
    # provider instance (a small companion service, see docker-compose)
    # which mints tokens on demand. Without it configured, YouTube imports
    # will continue to intermittently (or entirely) fail with "No video
    # formats found!" regardless of cookies or player_client tricks.
    opts = {
        "quiet": True,
        "no_warnings": True,
        "verbose": True,  # required so our diagnostic logger sees PO token status lines
        "format": "bv*+ba/b/best",
        "ignore_no_formats_error": True,
        "retries": 5,
        "extractor_retries": 5,
        "fragment_retries": 10,
        "http_headers": {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/125.0.0.0 Safari/537.36"
            ),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
        },
        "extractor_args": {
            "youtube": {
                "player_client": [
                    "tv",
                    "android",
                    "web_safari",
                    "web",
                ],
            },
        },
    }

    if settings.pot_provider_base_url:
        opts["extractor_args"]["youtubepot-bgutilhttp"] = {
            "base_url": [settings.pot_provider_base_url],
        }

    if diagnostic_logger is not None:
        opts["logger"] = diagnostic_logger

    cookie_path = _cookies_path()
    if cookie_path.exists():
        opts["cookiefile"] = str(cookie_path)
        logger.info(f"Using yt-dlp cookies from: {cookie_path}")
    else:
        logger.info(
            "No YouTube cookies configured — uploading a cookies.txt via "
            "POST /api/url-import/cookies significantly improves reliability."
        )
    return opts


async def _get_or_create_app_settings(db: AsyncSession) -> AppSettings:
    result = await db.execute(select(AppSettings).where(AppSettings.id == "default"))
    row = result.scalar_one_or_none()
    if row is None:
        row = AppSettings(id="default")
        db.add(row)
        await db.flush()
    return row


# File extensions we'll treat as a direct media link without needing to
# probe the URL first. Content-Type sniffing (see `_looks_like_direct_media`)
# still runs for URLs that don't end in one of these, so a CDN link with no
# extension but a `video/*` Content-Type is also accepted.
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


def _is_supported_url(url: str) -> bool:
    """Check if the URL is from a supported platform (yt-dlp-backed) source."""
    try:
        from urllib.parse import urlparse

        parsed = urlparse(url)
        domain = parsed.netloc.lower()
        # Strip port if present
        if ":" in domain:
            domain = domain.split(":")[0]
        return domain in SUPPORTED_DOMAINS
    except Exception:
        return False


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
    Determine whether a URL points directly at a media file rather than a
    platform page that needs yt-dlp. Tries a cheap extension check first,
    then falls back to a HEAD request and inspects Content-Type.
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
        return "Invalid URL format. Please enter a valid video URL (e.g., https://www.youtube.com/watch?v=...)."

    if _is_supported_url(url):
        return None

    if _looks_like_direct_media(url):
        return None

    return "This URL source is not supported. Supported sources: YouTube, Vimeo, Dailymotion, TikTok, X/Twitter, Instagram, Facebook, Reddit, or a direct link to a video/audio file."


def _classify_url(url: str) -> tuple[Optional[str], bool]:
    """
    Validate the URL and classify it in one pass (avoids probing
    Content-Type twice). Returns (error_message, is_direct_media).
    """
    if not url or not url.strip():
        return "No URL provided.", False

    url = url.strip()

    url_pattern = re.compile(
        r"^https?://"
        r"([\w.-]+)"
        r"(\.[\w.-]+)+"
        r"[/\w\.\-~:@!#$%&'()*+,;=]*"
        r"(\?[\w\.\-~:@!#$%&'()*+,;=/]*)?$"
    )
    if not url_pattern.match(url):
        return (
            "Invalid URL format. Please enter a valid video URL (e.g., https://www.youtube.com/watch?v=...).",
            False,
        )

    if _is_supported_url(url):
        return None, False

    if _looks_like_direct_media(url):
        return None, True

    return (
        "This URL source is not supported. Supported sources: YouTube, Vimeo, Dailymotion, TikTok, X/Twitter, Instagram, Facebook, Reddit, or a direct link to a video/audio file.",
        False,
    )


def _extract_direct_media_info(url: str) -> dict:
    """
    Build an info dict for a direct media URL without invoking yt-dlp.
    We can't know duration without downloading/probing the file, so it's
    left as None — the pipeline's transcription/analysis step will pick
    it up from the file itself once downloaded.
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


def _extract_info(url: str, is_direct: bool = False) -> dict:
    """Extract video info, either directly (no yt-dlp) or via yt-dlp."""
    if is_direct:
        return _extract_direct_media_info(url)

    diag = _YtdlpDiagnosticLogger()
    opts = _get_ytdlp_opts(diagnostic_logger=diag)
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=False)
            return {
                "title": info.get("title", "Untitled"),
                "duration": info.get("duration"),
                "uploader": info.get("uploader")
                or info.get("channel")
                or info.get("creator"),
                "thumbnail": info.get("thumbnail"),
                "webpage_url": info.get("webpage_url") or url,
                "ext": info.get("ext", "mp4"),
            }
    except Exception as e:
        pot_info = diag.pot_diagnostics()
        if pot_info:
            raise RuntimeError(f"{e} | PO token diagnostics: {pot_info}") from e
        raise


def _download_direct_media(url: str, output_path: Path) -> tuple[Path, dict]:
    """
    Stream a direct media URL straight to disk over HTTP, no yt-dlp
    involved. Returns (downloaded_file_path, info_dict).
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


def _download_video(
    url: str, output_path: Path, is_direct: bool = False
) -> tuple[Path, dict]:
    """
    Download video, either directly (streamed HTTP) or via yt-dlp.
    Returns (downloaded_file_path, info_dict).
    """
    if is_direct:
        return _download_direct_media(url, output_path)

    # Use a temporary filename pattern
    temp_template = output_path / "%(id)s.%(ext)s"

    diag = _YtdlpDiagnosticLogger()
    opts = {
        **_get_ytdlp_opts(diagnostic_logger=diag),
        "outtmpl": str(temp_template),
        "format": "bv*+ba/b",
        "merge_output_format": "mp4",
        "ignore_no_formats_error": True,
        "postprocessors": [
            {
                "key": "FFmpegVideoConvertor",
                "preferedformat": "mp4",
            }
        ],
    }

    try:
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
                    if f.stem == video_id and f.suffix in (
                        ".mp4",
                        ".mkv",
                        ".webm",
                        ".mov",
                    ):
                        filepath = f
                        break

            return filepath, info
    except Exception as e:
        pot_info = diag.pot_diagnostics()
        if pot_info:
            raise RuntimeError(f"{e} | PO token diagnostics: {pot_info}") from e
        raise


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


# ── Cookies Endpoints ───────────────────────────────────────────────────


@router.get("/url-import/cookies")
async def get_cookies_status(db: AsyncSession = Depends(get_db)):
    """
    GET /api/url-import/cookies

    Check whether YouTube cookies have been configured and are valid.
    Works purely off the DB + a default on-disk path — no env var needed.
    """
    cookie_path = _cookies_path()
    exists = cookie_path.exists()
    size = cookie_path.stat().st_size if exists else 0

    updated_at = None
    if exists:
        app_settings = await _get_or_create_app_settings(db)
        if app_settings.youtube_cookies_updated_at:
            updated_at = app_settings.youtube_cookies_updated_at.isoformat()

    return CookiesStatusResponse(
        hasCookies=exists,
        cookiePath=str(cookie_path),
        cookieSize=size,
        updatedAt=updated_at,
    )


@router.post("/url-import/cookies")
async def upload_cookies(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    """
    POST /api/url-import/cookies

    Upload a cookies.txt file exported from the browser (e.g. via the
    "Get cookies.txt LOCALLY" extension). Saved to a default on-disk path
    derived from the app's upload directory — nothing to configure via env
    vars first. Metadata (size, timestamp) is persisted to AppSettings so
    the settings page can show status without touching the filesystem.
    """
    cookie_path = _cookies_path()

    # Validate the uploaded file looks like a Netscape cookies file
    content = await file.read()
    if not content.strip():
        raise HTTPException(status_code=400, detail="Uploaded cookies file is empty.")

    decoded = content.decode("utf-8", errors="replace")

    # Check that it looks like a valid cookies file (Netscape format)
    if not any(
        line.strip().startswith((".youtube.com", "youtube.com", ".google.com", "#"))
        for line in decoded.splitlines()
    ):
        # It might still be valid — let a few lines through, but warn if totally unrecognizable
        first_line = decoded.splitlines()[0] if decoded.splitlines() else ""
        if not first_line.startswith("#") and "youtube" not in decoded.lower():
            raise HTTPException(
                status_code=400,
                detail="The uploaded file does not appear to be a valid cookies.txt file. "
                "Export from your browser using the 'Get cookies.txt LOCALLY' extension.",
            )

    # Ensure parent directory exists and write the cookies file
    cookie_path.parent.mkdir(parents=True, exist_ok=True)
    cookie_path.write_bytes(content)
    cookie_path.chmod(0o600)
    logger.info(f"YouTube cookies uploaded ({len(content)} bytes) to {cookie_path}")

    now = datetime.now(timezone.utc)
    app_settings = await _get_or_create_app_settings(db)
    app_settings.youtube_cookies_size = len(content)
    app_settings.youtube_cookies_updated_at = now
    await db.commit()

    return {
        "ok": True,
        "message": f"Cookies saved ({len(content)} bytes).",
        "size": len(content),
        "updatedAt": now.isoformat(),
    }


@router.delete("/url-import/cookies")
async def delete_cookies(db: AsyncSession = Depends(get_db)):
    """
    DELETE /api/url-import/cookies

    Remove the stored cookies file and clear its DB metadata.
    """
    cookie_path = _cookies_path()
    if cookie_path.exists():
        cookie_path.unlink()
        logger.info(f"YouTube cookies removed: {cookie_path}")

    app_settings = await _get_or_create_app_settings(db)
    app_settings.youtube_cookies_size = None
    app_settings.youtube_cookies_updated_at = None
    await db.commit()

    return {"ok": True, "message": "Cookies removed."}


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

    # Validate + classify URL (platform vs. direct media) in one pass
    error, is_direct = _classify_url(url)
    if error:
        raise HTTPException(status_code=400, detail=error)

    try:
        # Run info extraction in a thread to avoid blocking
        loop = asyncio.get_event_loop()
        info = await loop.run_in_executor(None, _extract_info, url, is_direct)

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

    # Validate + classify URL (platform vs. direct media) in one pass
    error, is_direct = _classify_url(url)
    if error:
        raise HTTPException(status_code=400, detail=error)

    # Create output directory
    download_dir = settings.upload_path / "url_imports"
    download_dir.mkdir(parents=True, exist_ok=True)

    # ── Step 1: Download the video ────────────────────────────────────
    try:
        loop = asyncio.get_event_loop()

        logger.info(f"Starting download for URL: {url} (direct_media={is_direct})")

        # Extract info first (lightweight)
        info = await loop.run_in_executor(None, _extract_info, url, is_direct)
        title = info["title"]
        duration = info["duration"]
        uploader = info["uploader"]

        logger.info(f"URL resolved: title='{title}', duration={duration}s")

        # Download the video (heavy operation, run in thread)
        download_path, download_info = await loop.run_in_executor(
            None, _download_video, url, download_dir, is_direct
        )

        file_data = download_path.read_bytes()
        file_size = len(file_data)
        filename = download_path.name

        logger.info(f"Download complete for '{title}': {filename} ({file_size} bytes)")

    except Exception as e:
        logger.error(f"Download failed for URL {url}: {e}")
        detail = (
            "YouTube blocked the download (bot detection). Try uploading YouTube "
            "cookies via Settings, or wait and retry."
            if not is_direct and "format" in str(e).lower()
            else f"Could not download video from the provided URL. Error: {str(e)}"
        )
        raise HTTPException(status_code=400, detail=detail)

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
        # NOTE: a DatatypeMismatchError here ("column is of type JobStatus
        # but expression is of type character varying") means the Job.status
        # / PipelineStep.status columns are SQLAlchemy String columns but the
        # actual Postgres columns are native enum types. That's a model/
        # migration mismatch, not something we can safely work around here
        # (guessing at enum values could write bad data). See app/models.py.
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
