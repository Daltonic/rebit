"""
Sia storage service.

Uses the `sia-storage` Python SDK (v0.8.0) to upload and pin job artifacts
(transcripts, clips, source videos) on the Sia decentralized storage network.

In demo mode, returns fake "demo-sia-{id}" hashes so the pipeline can
continue without actual Sia infrastructure.
"""

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from sia_storage import PinnedObject

from backend.app.config import settings
from backend.app.models import Job, Segment, Transcript, SiaLog, PipelineStep
from backend.app.services import sia_client

logger = logging.getLogger(__name__)

# ── Demo Mode ────────────────────────────────────────────────────────────

DEMO_PREFIX = "demo-sia-"


async def store_job_artifacts(
    job_id: str,
    db: AsyncSession,
) -> dict:
    """
    Store all job artifacts on Sia.

    1. Uploads transcript
    2. Uploads rendered clips
    3. Uploads source video
    4. Updates job with Sia hashes
    """
    # Fetch job
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        return {"passed": False, "message": f"Job {job_id} not found"}

    await _update_step(db, job_id, "store", "running", 10, "Starting Sia storage...")

    try:
        # Check if Sia SDK is ready
        sdk = await sia_client.get_sdk()
        if sdk is None:
            return await _demo_store(job_id, job, db)

        # Live mode — use SDK
        await _update_step(db, job_id, "store", "running", 30, "Uploading transcript to Sia...")

        # Step 1: Upload transcript
        transcript_result = await db.execute(
            select(Transcript).where(Transcript.job_id == job_id)
        )
        transcript = transcript_result.scalar_one_or_none()

        if transcript:
            transcript_data = json.dumps(transcript.json_content).encode("utf-8")
            obj = PinnedObject()
            uploaded = sdk.upload(obj, transcript_data)
            transcript.sia_object_id = uploaded.id()
            await _add_sia_log(db, job_id, "upload_transcript", True, f"Transcript uploaded: {uploaded.id()}")

        # Step 2: Upload rendered clips
        await _update_step(db, job_id, "store", "running", 50, "Uploading clips to Sia...")
        segments_result = await db.execute(
            select(Segment).where(
                Segment.job_id == job_id,
                Segment.clip_path.isnot(None),
            )
        )
        segments = segments_result.scalars().all()

        for segment in segments:
            clip_path = Path(segment.clip_path)
            if clip_path.exists():
                clip_data = clip_path.read_bytes()
                obj = PinnedObject()
                uploaded = sdk.upload(obj, clip_data)
                segment.sia_object_id = uploaded.id()
                await _add_sia_log(db, job_id, "upload_clip", True, f"Clip uploaded: {uploaded.id()}")

        # Step 3: Upload source video
        await _update_step(db, job_id, "store", "running", 70, "Uploading source video to Sia...")
        video_path = settings.upload_path / f"{job_id}.mp4"
        if not video_path.exists():
            video_path = settings.upload_path / job.source_filename

        if video_path.exists():
            video_data = video_path.read_bytes()
            obj = PinnedObject()
            uploaded = sdk.upload(obj, video_data)
            job.source_sia_object_id = uploaded.id()
            await _add_sia_log(db, job_id, "upload_source", True, f"Source uploaded: {uploaded.id()}")

        # Step 4: Pin all objects
        await _update_step(db, job_id, "store", "running", 85, "Pinning objects on Sia...")
        all_object_ids = []
        if transcript and transcript.sia_object_id:
            all_object_ids.append(transcript.sia_object_id)
        for segment in segments:
            if segment.sia_object_id:
                all_object_ids.append(segment.sia_object_id)
        if job.source_sia_object_id:
            all_object_ids.append(job.source_sia_object_id)

        for oid in all_object_ids:
            try:
                pinned = sdk.object(oid)
                sdk.pin_object(pinned)
            except Exception as e:
                logger.warning(f"Failed to pin {oid}: {e}")

        # Update job with Sia hash
        if all_object_ids:
            job.sia_hash = all_object_ids[0]
            job.sia_status = "ready"

        await _update_step(db, job_id, "store", "complete", 100, "Sia storage complete")

        # Update job status
        job.status = "complete"

        return {
            "passed": True,
            "message": f"Stored {len(all_object_ids)} objects on Sia",
            "sia_hash": job.sia_hash,
            "sia_status": "ready",
        }

    except Exception as e:
        await _update_step(db, job_id, "store", "failed", 0, f"Sia storage failed: {str(e)}")
        await _add_sia_log(db, job_id, "store", False, str(e))
        return {"passed": False, "message": f"Sia storage failed: {str(e)}"}


async def _demo_store(
    job_id: str,
    job: Job,
    db: AsyncSession,
    reason: str = "Sia not connected — demo mode",
) -> dict:
    """Store artifacts with demo (fake) Sia hashes."""
    await _update_step(db, job_id, "store", "running", 50, f"Demo mode: {reason}")

    # Create demo hashes
    demo_hash = f"{DEMO_PREFIX}{job_id}"
    job.sia_hash = demo_hash
    job.sia_status = "ready"
    job.source_sia_object_id = f"{DEMO_PREFIX}source-{job_id}"

    # Update transcript
    transcript_result = await db.execute(
        select(Transcript).where(Transcript.job_id == job_id)
    )
    transcript = transcript_result.scalar_one_or_none()
    if transcript:
        transcript.sia_object_id = f"{DEMO_PREFIX}transcript-{job_id}"

    # Update segments
    segments_result = await db.execute(
        select(Segment).where(Segment.job_id == job_id)
    )
    for segment in segments_result.scalars().all():
        segment.sia_object_id = f"{DEMO_PREFIX}clip-{segment.id}"

    await _add_sia_log(db, job_id, "demo_store", True, f"Demo storage complete: {demo_hash}")

    await _update_step(db, job_id, "store", "complete", 100, "Demo storage complete")

    # Update job status
    job.status = "complete"

    return {
        "passed": True,
        "message": f"Demo storage complete: {demo_hash}",
        "sia_hash": demo_hash,
        "sia_status": "ready",
    }


async def _add_sia_log(
    db: AsyncSession,
    job_id: str,
    step: str,
    passed: bool,
    message: str,
):
    """Add a Sia log entry."""
    db.add(SiaLog(
        job_id=job_id,
        step=step,
        passed=passed,
        message=message,
    ))


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