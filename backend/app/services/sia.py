"""
Sia storage service.

Uses the `sia-storage` Python SDK (v0.8.0) to upload and pin job artifacts
(transcripts, clips, source videos) on the Sia decentralized storage network.

In demo mode, returns fake "demo-sia-{id}" hashes so the pipeline can
continue without actual Sia infrastructure.
"""

import asyncio
import json
import logging
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from sia_storage import PinnedObject

from app.config import settings
from app.database import async_session_factory
from app.models import Job, Segment, Transcript, SiaLog
from app.services import sia_client
from app.services.sia_client import DEMO_PREFIX, is_real_object_id
from app.services.pipeline_steps import upsert_pipeline_step
from app.services.pipeline_events import publish_event

logger = logging.getLogger(__name__)


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

    await upsert_pipeline_step(
        db, job_id, "sia_store", "running", 10, "Starting Sia storage..."
    )

    try:
        # Check if Sia SDK is ready
        sdk = await sia_client.get_sdk()
        if sdk is None:
            return await _demo_store(job_id, job, db)

        # Live mode — use SDK
        await upsert_pipeline_step(
            db, job_id, "sia_store", "running", 30, "Uploading transcript to Sia..."
        )

        # Step 1: Upload transcript
        transcript_result = await db.execute(
            select(Transcript).where(Transcript.job_id == job_id)
        )
        transcript = transcript_result.scalar_one_or_none()

        if transcript:
            transcript_data = json.dumps(transcript.json_content).encode("utf-8")
            obj = PinnedObject()
            try:
                uploaded = await sia_client.upload_bytes(sdk, obj, transcript_data)
                transcript.sia_object_id = uploaded.id()
                await _add_sia_log(
                    db,
                    job_id,
                    "upload_transcript",
                    True,
                    f"Transcript uploaded: {uploaded.id()}",
                )
            except Exception as e:
                # Don't let one failed artifact take down the whole stage —
                # log it and keep going, the same way the pin loop below does.
                logger.warning(f"Failed to upload transcript for job {job_id}: {e}")
                await _add_sia_log(
                    db,
                    job_id,
                    "upload_transcript",
                    False,
                    f"Transcript upload failed: {e}",
                )

        # Step 2: Upload rendered clips
        await upsert_pipeline_step(
            db, job_id, "sia_store", "running", 50, "Uploading clips to Sia..."
        )
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
                try:
                    uploaded = await sia_client.upload_bytes(sdk, obj, clip_data)
                    segment.sia_object_id = uploaded.id()
                    await _add_sia_log(
                        db,
                        job_id,
                        "upload_clip",
                        True,
                        f"Clip uploaded: {uploaded.id()}",
                    )
                except Exception as e:
                    # One bad clip (timeout, indexer hiccup, oversized file)
                    # shouldn't sink every other clip's upload. Log and move on;
                    # this segment just won't have a sia_object_id.
                    logger.warning(
                        f"Failed to upload clip {segment.id} for job {job_id}: {e}"
                    )
                    await _add_sia_log(
                        db,
                        job_id,
                        "upload_clip",
                        False,
                        f"Clip {segment.id} upload failed: {e}",
                    )

        # Step 3: Upload source video
        # The sia_upload stage already uploads this file earlier in the
        # pipeline. If it already got a real (non-demo) object id, don't
        # upload the same source video a second time here — just reuse it.
        if is_real_object_id(job.source_sia_object_id):
            await _add_sia_log(
                db,
                job_id,
                "upload_source",
                True,
                f"Source already stored on Sia: {job.source_sia_object_id}",
            )
        else:
            await upsert_pipeline_step(
                db,
                job_id,
                "sia_store",
                "running",
                70,
                "Uploading source video to Sia...",
            )
            video_path = settings.upload_path / f"{job_id}.mp4"
            if not video_path.exists():
                video_path = settings.upload_path / job.source_filename

            if video_path.exists():
                video_data = video_path.read_bytes()
                obj = PinnedObject()
                try:
                    uploaded = await sia_client.upload_bytes(sdk, obj, video_data)
                    job.source_sia_object_id = uploaded.id()
                    await _add_sia_log(
                        db,
                        job_id,
                        "upload_source",
                        True,
                        f"Source uploaded: {uploaded.id()}",
                    )
                except Exception as e:
                    logger.warning(
                        f"Failed to upload source video for job {job_id}: {e}"
                    )
                    await _add_sia_log(
                        db, job_id, "upload_source", False, f"Source upload failed: {e}"
                    )

        # Step 4: Pin all objects
        await upsert_pipeline_step(
            db, job_id, "sia_store", "running", 85, "Pinning objects on Sia..."
        )
        all_object_ids = []
        if transcript and transcript.sia_object_id:
            all_object_ids.append(transcript.sia_object_id)
        for segment in segments:
            if segment.sia_object_id:
                all_object_ids.append(segment.sia_object_id)
        if job.source_sia_object_id:
            all_object_ids.append(job.source_sia_object_id)

        for oid in all_object_ids:
            if not is_real_object_id(oid):
                # A demo hash (e.g. left over from an earlier failed run
                # of sia_upload) has no business reaching the live SDK's
                # pin call — that's exactly what produced "hex error:
                # Unexpected length". Skip it instead.
                logger.warning(f"Skipping pin for non-live object id: {oid}")
                continue
            try:
                pinned = await asyncio.wait_for(
                    sdk.object(oid), timeout=sia_client.SIA_PIN_TIMEOUT
                )
                await asyncio.wait_for(
                    sdk.pin_object(pinned), timeout=sia_client.SIA_PIN_TIMEOUT
                )
            except Exception as e:
                logger.warning(f"Failed to pin {oid}: {e}")

        # Update job with Sia hash
        if all_object_ids:
            job.sia_hash = all_object_ids[0]
            job.sia_status = "ready"

        await upsert_pipeline_step(
            db, job_id, "sia_store", "complete", 100, "Sia storage complete"
        )

        # NOTE: job.status = "complete" is set by the orchestrator once ALL
        # stages finish (pipeline_orchestrator.py), not here. sia_store
        # happens to be the last stage today, but stage code shouldn't be
        # the one deciding "the whole pipeline is done" — that's an
        # orchestrator-level fact, not a stage-level one.

        return {
            "passed": True,
            "message": f"Stored {len(all_object_ids)} objects on Sia",
            "sia_hash": job.sia_hash,
            "sia_status": "ready",
        }

    except Exception as e:
        await upsert_pipeline_step(
            db, job_id, "sia_store", "failed", 0, f"Sia storage failed: {str(e)}"
        )
        await _add_sia_log(db, job_id, "store", False, str(e))
        return {"passed": False, "message": f"Sia storage failed: {str(e)}"}


async def _demo_store(
    job_id: str,
    job: Job,
    db: AsyncSession,
    reason: str = "Sia not connected — demo mode",
) -> dict:
    """Store artifacts with demo (fake) Sia hashes."""
    await upsert_pipeline_step(
        db, job_id, "sia_store", "running", 50, f"Demo mode: {reason}"
    )

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
    segments_result = await db.execute(select(Segment).where(Segment.job_id == job_id))
    for segment in segments_result.scalars().all():
        segment.sia_object_id = f"{DEMO_PREFIX}clip-{segment.id}"

    await _add_sia_log(
        db, job_id, "demo_store", True, f"Demo storage complete: {demo_hash}"
    )

    await upsert_pipeline_step(
        db, job_id, "sia_store", "complete", 100, "Demo storage complete"
    )

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
    """
    Add a Sia log entry.

    This used to do `db.add(...)` on the caller's session — which, for
    every call site in this file, is the pipeline orchestrator's single
    long-lived session that isn't committed until the *entire* pipeline
    finishes. That's why the UI only ever showed one log line (the
    source-upload one, written earlier by a different, already-committed
    session) until a manual refresh: every other SiaLog row genuinely
    hadn't reached the database yet.

    Writing through its own short-lived session and committing
    immediately means each log line is visible to the next `GET
    /api/jobs/{id}` request (or the live event below) the instant it's
    created, not just once the whole job finishes.
    """
    async with async_session_factory() as log_db:
        log_db.add(
            SiaLog(
                job_id=job_id,
                step=step,
                passed=passed,
                message=message,
            )
        )
        await log_db.commit()

    # Push it live too, so the "Sia Logs" panel fills in as uploads
    # happen instead of only updating on the next full refetch.
    await publish_event(
        job_id,
        {
            "type": "sia_log",
            "step": step,
            "passed": passed,
            "message": message,
        },
    )
