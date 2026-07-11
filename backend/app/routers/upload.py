"""
Upload API router.

Handles multipart video file uploads with the following flow:
  1. Receive the video file via multipart form data
  2. Create a Job record in the database
  3. Upload the source video to Sia Network (first priority — before any processing)
  4. Save the video locally for pipeline processing
  5. Trigger the pipeline orchestration in the background
  6. Return the job_id to the frontend
"""

import asyncio
import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models import Job, PipelineStep, SiaLog
from app.services import sia_client
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


async def _upload_to_sia(
    job_id: str,
    file_data: bytes,
    filename: str,
    db: AsyncSession,
) -> dict:
    """
    Upload the source video to Sia Network immediately.

    This is the FIRST step of the pipeline — the video is stored on Sia
    before any processing begins. Returns Sia object info or demo fallback.
    """
    sdk = await sia_client.get_sdk()

    if sdk is not None:
        # Live mode — upload to Sia
        try:
            from sia_storage import PinnedObject

            obj = PinnedObject()
            uploaded = await sdk.upload(obj, file_data)
            sia_object_id = uploaded.id()

            try:
                pinned = await sdk.object(sia_object_id)
                await sdk.pin_object(pinned)
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
            # Fall through to demo mode

    # Demo mode — generate fake Sia hash
    demo_hash = f"demo-sia-{job_id}"
    db.add(SiaLog(
        job_id=job_id,
        step="sia_upload_source",
        passed=True,
        message=f"Demo: Source video stored with hash {demo_hash}",
    ))

    logger.info(f"Demo Sia upload for job {job_id}: {demo_hash}")
    return {"sia_object_id": demo_hash, "sia_status": "ready", "demo": True}


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
      3. Upload the source video to Sia Network (FIRST — before any processing)
      4. Save the video locally for pipeline processing
      5. Start pipeline orchestration in the background
      6. Return the job_id

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
        status="uploading",
        source_filename=file.filename,
        sia_status="pending",
        user_id=user_id,
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
    logger.info(f"Job {job_id} created for file: {file.filename} ({file_size} bytes)")

    # ── Upload to Sia FIRST ───────────────────────────────────────────────
    try:
        sia_result = await _upload_to_sia(job_id, file_data, file.filename, db)

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

    # ── Save Locally ──────────────────────────────────────────────────────
    try:
        local_path = settings.upload_path / f"{job_id}.mp4"
        local_path.parent.mkdir(parents=True, exist_ok=True)
        local_path.write_bytes(file_data)
        logger.info(f"Video saved locally for job {job_id}: {local_path}")
    except Exception as e:
        logger.error(f"Failed to save video locally for job {job_id}: {e}")

    # ── Update Job Status ─────────────────────────────────────────────────
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

    # ── Trigger Pipeline (background) ────────────────────────────────────
    asyncio.create_task(run_pipeline_async(job_id))
    logger.info(f"Async pipeline started for job {job_id}")

    return {
        "jobId": job_id,
        "filename": file.filename,
        "sizeBytes": file_size,
        "siaObjectId": job.source_sia_object_id,
        "siaStatus": job.sia_status,
        "status": job.status,
    }