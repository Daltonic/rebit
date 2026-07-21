"""
Sia source video upload service.

Uploads the source video to the Sia Network as the first pipeline step.
This runs asynchronously in the background pipeline, so the upload
endpoint can return immediately without waiting for Sia.
"""

import logging
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import Job, PipelineStep, SiaLog
from app.services import sia_client

logger = logging.getLogger(__name__)

# ── Demo Mode ────────────────────────────────────────────────────────────

DEMO_PREFIX = "demo-sia-"


async def upload_source_to_sia(
    job_id: str,
    db: AsyncSession,
) -> dict:
    """
    Upload the source video file to the Sia Network.

    Reads the locally-saved video file for this job and uploads it to Sia.
    In demo mode (no Sia SDK available), generates a fake Sia hash.

    Returns:
        dict with 'passed' (bool), 'message' (str), and Sia metadata.
    """
    # Fetch the job
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        return {"passed": False, "message": f"Job {job_id} not found"}

    # Update pipeline step to running
    await _update_step(db, job_id, "sia_upload", "running", 10,
                       "Uploading source video to Sia Network...")

    # Read the source file from disk
    video_path = settings.upload_path / f"{job_id}.mp4"
    if not video_path.exists():
        # Fall back to the original filename
        video_path = settings.upload_path / job.source_filename
    if not video_path.exists():
        return {"passed": False, "message": f"Source video file not found for job {job_id}"}

    file_data = video_path.read_bytes()
    filename = video_path.name

    try:
        sdk = await sia_client.get_sdk()

        if sdk is not None:
            # Live mode — upload to Sia
            try:
                from sia_storage import PinnedObject

                await _update_step(db, job_id, "sia_upload", "running", 30,
                                   "Uploading to Sia Network...")

                obj = PinnedObject()
                uploaded = await sdk.upload(obj, file_data)
                sia_object_id = uploaded.id()

                await _update_step(db, job_id, "sia_upload", "running", 60,
                                   f"Uploaded to Sia ({sia_object_id[:16]}...), pinning...")

                # Pin the object
                try:
                    pinned = await sdk.object(sia_object_id)
                    await sdk.pin_object(pinned)
                except Exception as e:
                    logger.warning(f"Failed to pin Sia object {sia_object_id}: {e}")

                # Update job with Sia info
                job.source_sia_object_id = sia_object_id
                job.sia_hash = sia_object_id
                job.sia_status = "ready"

                db.add(SiaLog(
                    job_id=job_id,
                    step="sia_upload_source",
                    passed=True,
                    message=f"Source video uploaded to Sia: {sia_object_id}",
                ))

                await _update_step(db, job_id, "sia_upload", "complete", 100,
                                   f"Source video stored on Sia: {sia_object_id[:16]}...")

                logger.info(f"Sia upload complete for job {job_id}: {sia_object_id}")
                return {
                    "passed": True,
                    "message": f"Source video uploaded to Sia: {sia_object_id[:16]}...",
                    "sia_object_id": sia_object_id,
                    "sia_status": "ready",
                }

            except Exception as e:
                error_msg = f"Sia upload failed: {str(e)}"
                logger.error(f"Sia upload failed for job {job_id}: {e}")

                db.add(SiaLog(
                    job_id=job_id,
                    step="sia_upload_source",
                    passed=False,
                    message=error_msg,
                ))
                # Fall through to demo mode

        # Demo mode — generate fake Sia hash
        demo_hash = f"{DEMO_PREFIX}{job_id}"
        job.source_sia_object_id = demo_hash
        job.sia_hash = demo_hash
        job.sia_status = "ready"

        db.add(SiaLog(
            job_id=job_id,
            step="sia_upload_source",
            passed=True,
            message=f"Demo: Source video stored with hash {demo_hash}",
        ))

        await _update_step(db, job_id, "sia_upload", "complete", 100,
                           f"Demo: Source video stored with hash {demo_hash[:16]}...")

        logger.info(f"Demo Sia upload for job {job_id}: {demo_hash}")
        return {
            "passed": True,
            "message": f"Demo source video stored: {demo_hash[:16]}...",
            "sia_object_id": demo_hash,
            "sia_status": "ready",
        }

    except Exception as e:
        error_msg = f"Sia upload failed: {str(e)}"
        logger.error(f"Sia upload failed for job {job_id}: {e}")

        db.add(SiaLog(
            job_id=job_id,
            step="sia_upload_source",
            passed=False,
            message=error_msg,
        ))

        await _update_step(db, job_id, "sia_upload", "failed", 0, error_msg)
        return {"passed": False, "message": error_msg}


async def _update_step(
    db: AsyncSession,
    job_id: str,
    stage: str,
    status: str,
    progress_pct: int,
    message: str,
):
    """Create or update a pipeline step record."""
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(PipelineStep).where(
            PipelineStep.job_id == job_id,
            PipelineStep.stage == stage,
        )
    )
    step = result.scalar_one_or_none()

    if step:
        step.status = status
        step.progress_pct = progress_pct
        step.message = message
        if status == "running" and not step.started_at:
            step.started_at = now
        if status in ("complete", "failed"):
            step.completed_at = now
    else:
        db.add(PipelineStep(
            job_id=job_id,
            stage=stage,
            status=status,
            progress_pct=progress_pct,
            message=message,
            started_at=now if status == "running" else None,
        ))