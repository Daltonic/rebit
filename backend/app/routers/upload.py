"""
Upload API router.

Handles multipart video file uploads with a simple flow:
  1. Validate the file
  2. Create a Job record in the database
  3. Save the video locally
  4. Return the job_id to the frontend immediately
  5. Sia upload and pipeline stages run asynchronously in the background
"""

import asyncio
import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models import Job, PipelineStep
from app.services.pipeline_orchestrator import run_pipeline_async

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["upload"])

# ── Allowed video MIME types ──────────────────────────────────────────────

ALLOWED_MIME_TYPES = {
    "video/mp4",
    "video/quicktime",
    "video/webm",
    "video/x-matroska",
    "video/x-msvideo",
    "video/x-flv",
    "video/ogg",
}

ALLOWED_EXTENSIONS = {".mp4", ".mov", ".webm", ".mkv", ".avi", ".flv", ".ogv"}

MAX_FILE_SIZE = settings.max_upload_size_mb * 1024 * 1024  # Convert MB to bytes


def _validate_video(filename: str, content_type: str, file_size: int) -> Optional[str]:
    """Validate the uploaded video file. Returns an error message or None."""
    if file_size > MAX_FILE_SIZE:
        max_mb = settings.max_upload_size_mb
        actual_mb = file_size / (1024 * 1024)
        return f"File too large. Maximum is {max_mb} MB ({actual_mb:.1f} MB given)."

    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        return f"Unsupported format '{ext}'. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}"

    if content_type and content_type not in ALLOWED_MIME_TYPES and content_type != "application/octet-stream":
        return f"Unsupported media type '{content_type}'."

    return None


@router.post("/upload")
async def upload_video(
    file: UploadFile = File(...),
    user_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """
    POST /api/upload

    Upload a video file. The flow is:
      1. Validate the file
      2. Create a Job record in the database
      3. Save the video locally
      4. Return the job_id to the frontend immediately
      5. Sia upload and pipeline stages run asynchronously in the background

    Accepts multipart/form-data with a single 'file' field.
    """
    # ── Validate ──────────────────────────────────────────────────────────
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided.")

    file_data = await file.read()
    file_size = len(file_data)

    if file_size == 0:
        raise HTTPException(status_code=400, detail="Empty file.")

    error = _validate_video(file.filename, file.content_type or "", file_size)
    if error:
        raise HTTPException(status_code=400, detail=error)

    # ── Create Job ────────────────────────────────────────────────────────
    job_id = f"job_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc)

    job = Job(
        id=job_id,
        status="uploaded",
        source_filename=file.filename,
        sia_status="pending",
        user_id=user_id,
        created_at=now,
        updated_at=now,
    )
    db.add(job)

    # ── Save Locally ──────────────────────────────────────────────────────
    try:
        local_path = settings.upload_path / f"{job_id}.mp4"
        local_path.parent.mkdir(parents=True, exist_ok=True)
        local_path.write_bytes(file_data)
        logger.info(f"Video saved locally for job {job_id}: {local_path}")
    except Exception as e:
        logger.error(f"Failed to save video locally for job {job_id}: {e}")

    # ── Add pipeline steps ────────────────────────────────────────────────
    db.add(PipelineStep(
        job_id=job_id,
        stage="sia_upload",
        status="pending",
        progress_pct=0,
        message="Waiting for Sia upload...",
    ))
    db.add(PipelineStep(
        job_id=job_id,
        stage="transcribe",
        status="pending",
        progress_pct=0,
        message="Waiting for transcription...",
    ))

    await db.commit()
    logger.info(f"Job {job_id} created for file: {file.filename} ({file_size} bytes)")

    # ── Trigger Pipeline (background) ────────────────────────────────────
    asyncio.create_task(run_pipeline_async(job_id))
    logger.info(f"Async pipeline started for job {job_id}")

    return {
        "jobId": job_id,
        "filename": file.filename,
        "sizeBytes": file_size,
        "siaObjectId": None,
        "siaStatus": "pending",
        "status": "uploaded",
    }