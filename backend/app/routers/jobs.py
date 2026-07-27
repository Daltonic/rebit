"""
Jobs API router.

Provides endpoints for querying job status and pipeline progress.
Used by the frontend to poll for real-time updates during processing.
"""

import asyncio
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Job, PipelineStep, Segment, Transcript, SiaLog
from app.services import sia_client
from app.services.cleanup import cleanup_job_files
from app.services.pipeline_steps import job_status_from_step_rows

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/jobs", tags=["jobs"])


@router.get("")
async def list_jobs(
    user_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """
    GET /api/jobs

    Returns a list of jobs, ordered by most recently created first.
    If user_id is provided, only jobs belonging to that user are returned.
    Each job includes its pipeline steps and segment count.
    """
    query = select(Job)
    if user_id:
        query = query.where(Job.user_id == user_id)
    query = query.order_by(Job.created_at.desc()).limit(50)
    result = await db.execute(query)
    jobs = result.scalars().all()

    response = []
    for job in jobs:
        steps = (
            (
                await db.execute(
                    select(PipelineStep)
                    .where(PipelineStep.job_id == job.id)
                    .order_by(
                        PipelineStep.started_at.asc().nullsfirst(), PipelineStep.stage
                    )
                )
            )
            .scalars()
            .all()
        )

        segment_count = len(
            (await db.execute(select(Segment).where(Segment.job_id == job.id)))
            .scalars()
            .all()
        )

        response.append(
            {
                "id": job.id,
                # Computed from PipelineStep rows rather than job.status: the
                # column can lag behind reality while the pipeline's own
                # long-running session is still mid-transaction. See
                # pipeline_steps.py for why.
                "status": job_status_from_step_rows(list(steps)),
                "sourceFilename": job.source_filename,
                "sourceSiaObjectId": job.source_sia_object_id,
                "durationSeconds": job.duration_seconds,
                "siaHash": job.sia_hash,
                "siaStatus": job.sia_status,
                "createdAt": job.created_at.isoformat() if job.created_at else None,
                "updatedAt": job.updated_at.isoformat() if job.updated_at else None,
                "pipelineSteps": [
                    {
                        "id": step.id,
                        "stage": step.stage,
                        "status": step.status,
                        "progressPct": step.progress_pct,
                        "message": step.message,
                        "startedAt": (
                            step.started_at.isoformat() if step.started_at else None
                        ),
                        "completedAt": (
                            step.completed_at.isoformat() if step.completed_at else None
                        ),
                    }
                    for step in steps
                ],
                "segmentCount": segment_count,
            }
        )

    return response


@router.get("/{job_id}")
async def get_job_status(
    job_id: str,
    db: AsyncSession = Depends(get_db),
):
    """
    GET /api/jobs/{job_id}

    Returns the current status of a job, including:
      - Job metadata (status, filename, Sia info, duration)
      - Pipeline steps with progress percentages
      - Detected segments (if any)
    """
    # Fetch job
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()

    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")

    # Fetch pipeline steps
    steps_result = await db.execute(
        select(PipelineStep)
        .where(PipelineStep.job_id == job_id)
        .order_by(PipelineStep.started_at.asc().nullsfirst(), PipelineStep.stage)
    )
    steps = steps_result.scalars().all()

    # Fetch segments
    segments_result = await db.execute(
        select(Segment)
        .where(Segment.job_id == job_id)
        .order_by(Segment.virality_score.desc())
    )
    segments = segments_result.scalars().all()

    # Fetch transcript info
    transcript_result = await db.execute(
        select(Transcript).where(Transcript.job_id == job_id)
    )
    transcript = transcript_result.scalar_one_or_none()

    # Fetch Sia logs
    sia_logs_result = await db.execute(
        select(SiaLog).where(SiaLog.job_id == job_id).order_by(SiaLog.ts.asc())
    )
    sia_logs = sia_logs_result.scalars().all()

    return {
        "id": job.id,
        # Computed from PipelineStep rows rather than job.status: the
        # column can lag behind reality while the pipeline's own
        # long-running session is still mid-transaction. See
        # pipeline_steps.py for why.
        "status": job_status_from_step_rows(list(steps)),
        "sourceFilename": job.source_filename,
        "sourceSiaObjectId": job.source_sia_object_id,
        "durationSeconds": job.duration_seconds,
        "siaHash": job.sia_hash,
        "siaStatus": job.sia_status,
        "createdAt": job.created_at.isoformat() if job.created_at else None,
        "updatedAt": job.updated_at.isoformat() if job.updated_at else None,
        "pipelineSteps": [
            {
                "id": step.id,
                "stage": step.stage,
                "status": step.status,
                "progressPct": step.progress_pct,
                "message": step.message,
                "startedAt": step.started_at.isoformat() if step.started_at else None,
                "completedAt": (
                    step.completed_at.isoformat() if step.completed_at else None
                ),
            }
            for step in steps
        ],
        "segments": [
            {
                "id": seg.id,
                "startSeconds": seg.start_seconds,
                "endSeconds": seg.end_seconds,
                "hookStrength": seg.hook_strength,
                "viralityScore": seg.virality_score,
                "emotionalSignal": seg.emotional_signal,
                "transcriptExcerpt": seg.transcript_excerpt,
                "status": seg.status,
                "clipPath": seg.clip_path,
                "siaObjectId": seg.sia_object_id,
            }
            for seg in segments
        ],
        "transcript": (
            {
                "id": transcript.id,
                "wordCount": len(transcript.vtt_content.split()) if transcript else 0,
                "createdAt": transcript.created_at.isoformat() if transcript else None,
            }
            if transcript
            else None
        ),
        "siaLogs": [
            {
                "id": log.id,
                "step": log.step,
                "passed": log.passed,
                "message": log.message,
                "ts": log.ts.isoformat() if log.ts else None,
            }
            for log in sia_logs
        ],
    }


@router.delete("/{job_id}")
async def delete_job(
    job_id: str,
    db: AsyncSession = Depends(get_db),
):
    """
    DELETE /api/jobs/{job_id}

    Delete a job and all related data (segments, pipeline steps, transcripts, sia logs).
    Related records are deleted manually to avoid cascade issues between SQLAlchemy and Prisma.

    Also performs cleanup of:
      - Local files on the server filesystem (source video, rendered clips, etc.)
      - Sia Network objects (unpins all pinned objects for this job)
    """
    try:
        result = await db.execute(select(Job).where(Job.id == job_id))
        job = result.scalar_one_or_none()

        if not job:
            raise HTTPException(status_code=404, detail=f"Job {job_id} not found")

        # ── Collect Sia object IDs before deleting the rows ──────────────
        # We need these to unpin from the Sia Network. Collect them before
        # the DELETE queries remove the rows they live in.
        sia_object_ids: list[str] = []

        # Job-level Sia object IDs
        if job.source_sia_object_id:
            sia_object_ids.append(job.source_sia_object_id)
        if job.sia_hash and job.sia_hash != job.source_sia_object_id:
            sia_object_ids.append(job.sia_hash)

        # Segment-level Sia object IDs
        segments_result = await db.execute(
            select(Segment).where(Segment.job_id == job_id)
        )
        for seg in segments_result.scalars().all():
            if seg.sia_object_id:
                sia_object_ids.append(seg.sia_object_id)

        # Transcript-level Sia object IDs
        transcript_result = await db.execute(
            select(Transcript).where(Transcript.job_id == job_id)
        )
        transcript = transcript_result.scalar_one_or_none()
        if transcript and transcript.sia_object_id:
            sia_object_ids.append(transcript.sia_object_id)

        # ── Delete database records ──────────────────────────────────────
        from sqlalchemy import delete as sa_delete

        await db.execute(sa_delete(PipelineStep).where(PipelineStep.job_id == job_id))
        await db.execute(sa_delete(Segment).where(Segment.job_id == job_id))
        await db.execute(sa_delete(Transcript).where(Transcript.job_id == job_id))
        await db.execute(sa_delete(SiaLog).where(SiaLog.job_id == job_id))

        # Now delete the job itself
        await db.delete(job)
        await db.commit()

        logger.info(f"Job {job_id} deleted from database")

        # ── Clean up local files ─────────────────────────────────────────
        cleanup_result = cleanup_job_files(job_id)
        if cleanup_result["errors"]:
            for err in cleanup_result["errors"]:
                logger.warning(f"File cleanup warning for job {job_id}: {err}")

        # ── Unpin from Sia Network (best-effort) ─────────────────────────
        # This runs after the DB commit so it doesn't block the response.
        # If it fails, the Sia objects remain pinned but orphaned — they
        # will eventually need manual cleanup or a future garbage-collection
        # pass. This is acceptable because Sia storage is cheap and the
        # objects are small.
        sdk = await sia_client.get_sdk()
        if sdk is not None and sia_object_ids:
            asyncio.create_task(
                _unpin_sia_objects(sia_object_ids, job_id)
            )

        return {
            "ok": True,
            "jobId": job_id,
            "cleanup": {
                "upload_deleted": cleanup_result["upload_deleted"],
                "output_deleted": cleanup_result["output_deleted"],
                "sia_unpin_queued": len(sia_object_ids),
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Failed to delete job {job_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete job: {str(e)}")


async def _unpin_sia_objects(object_ids: list[str], job_id: str) -> None:
    """
    Best-effort background task to delete Sia objects for a deleted job.

    Uses ``sdk.delete_object(key)`` to remove the object from the Sia
    Network entirely (not just unpin it). Runs as a fire-and-forget task
    after the DELETE response has been sent to the client. Failures are
    logged but never propagated.
    """
    sdk = await sia_client.get_sdk()
    if sdk is None:
        logger.warning(
            f"Cannot delete Sia objects for job {job_id}: Sia not connected"
        )
        return

    for oid in object_ids:
        if not sia_client.is_real_object_id(oid):
            logger.debug(f"Skipping delete for non-live object id: {oid}")
            continue
        try:
            await asyncio.wait_for(
                sdk.delete_object(oid), timeout=sia_client.SIA_PIN_TIMEOUT
            )
            logger.info(f"Deleted Sia object {oid[:16]}... for job {job_id}")
        except Exception as e:
            logger.warning(
                f"Failed to delete Sia object {oid[:16]}... for job {job_id}: {e}"
            )


@router.get("/{job_id}/pipeline")
async def get_pipeline_status(
    job_id: str,
    db: AsyncSession = Depends(get_db),
):
    """
    GET /api/jobs/{job_id}/pipeline

    Lightweight endpoint that returns only pipeline step status.
    Used by the frontend for polling without fetching all job data.
    """
    # Fetch job (just for status)
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()

    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")

    # Fetch pipeline steps
    steps_result = await db.execute(
        select(PipelineStep)
        .where(PipelineStep.job_id == job_id)
        .order_by(PipelineStep.started_at.asc().nullsfirst(), PipelineStep.stage)
    )
    steps = steps_result.scalars().all()

    return {
        "jobId": job.id,
        # Computed from PipelineStep rows rather than job.status: the
        # column can lag behind reality while the pipeline's own
        # long-running session is still mid-transaction. See
        # pipeline_steps.py for why.
        "status": job_status_from_step_rows(list(steps)),
        "pipelineSteps": [
            {
                "stage": step.stage,
                "status": step.status,
                "progressPct": step.progress_pct,
                "message": step.message,
            }
            for step in steps
        ],
    }


@router.get("/{job_id}/start-pipeline")
async def start_pipeline(
    job_id: str,
    start_from: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """
    GET /api/jobs/{job_id}/start-pipeline

    Manually start or resume the pipeline for a job.
    This is a fallback if Inngest is not available.

    Args:
        job_id: The job ID.
        start_from: Optional stage to start from (for retries).

    Returns immediately with status "started".
    The frontend should poll GET /api/jobs/{job_id}/pipeline for progress.
    """
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()

    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")

    # Kick off the pipeline in the background. start_pipeline_task() acquires
    # a per-job lock before spawning anything, so clicking "Resume pipeline"
    # while a pipeline task is already running for this job (or while the
    # auto-start from upload is still in flight) is a no-op instead of a
    # second task racing the first one over the same rows.
    from app.services.pipeline_orchestrator import start_pipeline_task

    start_result = await start_pipeline_task(job_id, start_from)

    if start_result["started"]:
        logger.info(
            f"Pipeline manually started for job {job_id} (start_from={start_from})"
        )
    else:
        logger.info(
            f"Pipeline start requested for job {job_id} but one is already running"
        )

    return {
        "jobId": job_id,
        "status": "started" if start_result["started"] else "already_running",
        "message": start_result["message"],
    }
