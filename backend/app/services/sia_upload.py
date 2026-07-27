"""
Sia source video upload service.

Uploads the source video to the Sia Network as the first pipeline step.
This runs asynchronously in the background pipeline, so the upload
endpoint can return immediately without waiting for Sia.

Idempotency note: url_import.py performs an eager, synchronous Sia
upload right when a job is created (for a fast "your video is safely
stored" confirmation to the user) before the pipeline even starts. This
function checks for that up front and, if it already succeeded, marks
this stage complete instantly instead of uploading the same file a
second time.
"""

import asyncio
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import Job, SiaLog
from app.services import sia_client
from app.services.sia_client import DEMO_PREFIX
from app.services.pipeline_steps import upsert_pipeline_step

logger = logging.getLogger(__name__)


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

    # ── Idempotency short-circuit ─────────────────────────────────────
    # If an earlier eager upload (e.g. from url_import.py) already
    # succeeded, don't upload the file again — just record the stage as
    # complete using the info that's already on the job.
    if job.sia_status == "ready" and job.source_sia_object_id:
        await upsert_pipeline_step(
            db,
            job_id,
            "sia_upload",
            "complete",
            100,
            f"Source video already stored on Sia: {job.source_sia_object_id[:16]}...",
        )
        return {
            "passed": True,
            "message": "Source video was already uploaded to Sia",
            "sia_object_id": job.source_sia_object_id,
            "sia_status": job.sia_status,
        }

    # Update pipeline step to running
    await upsert_pipeline_step(
        db,
        job_id,
        "sia_upload",
        "running",
        10,
        "Uploading source video to Sia Network...",
    )

    # Read the source file from disk
    video_path = settings.upload_path / f"{job_id}.mp4"
    if not video_path.exists():
        # Fall back to the original filename
        video_path = settings.upload_path / job.source_filename
    if not video_path.exists():
        return {
            "passed": False,
            "message": f"Source video file not found for job {job_id}",
        }

    file_data = video_path.read_bytes()
    filename = video_path.name

    try:
        sdk = await sia_client.get_sdk()

        if sdk is not None:
            # Live mode — upload to Sia. A failure here is a real failure:
            # it must NOT fall through to demo mode. Demo mode only exists
            # for when there's no SDK connection at all (the `else` branch
            # below) — masking a genuine upload error as demo success is
            # exactly what left jobs sitting on fake hashes while the UI
            # showed "Sia: live".
            from sia_storage import PinnedObject

            await upsert_pipeline_step(
                db,
                job_id,
                "sia_upload",
                "running",
                30,
                "Uploading to Sia Network...",
            )

            obj = PinnedObject()
            uploaded = await sia_client.upload_bytes(sdk, obj, file_data)
            sia_object_id = uploaded.id()

            await upsert_pipeline_step(
                db,
                job_id,
                "sia_upload",
                "running",
                60,
                f"Uploaded to Sia ({sia_object_id[:16]}...), pinning...",
            )

            # Pin the object we just got back — no need for a separate
            # sdk.object() lookup, we already have the PinnedObject.
            try:
                await asyncio.wait_for(
                    sdk.pin_object(uploaded), timeout=sia_client.SIA_PIN_TIMEOUT
                )
            except Exception as e:
                logger.warning(f"Failed to pin Sia object {sia_object_id}: {e}")

            # Update job with Sia info
            job.source_sia_object_id = sia_object_id
            job.sia_hash = sia_object_id
            job.sia_status = "ready"

            db.add(
                SiaLog(
                    job_id=job_id,
                    step="sia_upload_source",
                    passed=True,
                    message=f"Source video uploaded to Sia: {sia_object_id}",
                )
            )

            await upsert_pipeline_step(
                db,
                job_id,
                "sia_upload",
                "complete",
                100,
                f"Source video stored on Sia: {sia_object_id[:16]}...",
            )

            logger.info(f"Sia upload complete for job {job_id}: {sia_object_id}")
            return {
                "passed": True,
                "message": f"Source video uploaded to Sia: {sia_object_id[:16]}...",
                "sia_object_id": sia_object_id,
                "sia_status": "ready",
            }

        # Demo mode — only reached when there's no SDK connection at all.
        demo_hash = f"{DEMO_PREFIX}{job_id}"
        job.source_sia_object_id = demo_hash
        job.sia_hash = demo_hash
        job.sia_status = "ready"

        db.add(
            SiaLog(
                job_id=job_id,
                step="sia_upload_source",
                passed=True,
                message=f"Demo: Source video stored with hash {demo_hash}",
            )
        )

        await upsert_pipeline_step(
            db,
            job_id,
            "sia_upload",
            "complete",
            100,
            f"Demo: Source video stored with hash {demo_hash[:16]}...",
        )

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

        db.add(
            SiaLog(
                job_id=job_id,
                step="sia_upload_source",
                passed=False,
                message=error_msg,
            )
        )

        await upsert_pipeline_step(db, job_id, "sia_upload", "failed", 0, error_msg)
        return {"passed": False, "message": error_msg}
