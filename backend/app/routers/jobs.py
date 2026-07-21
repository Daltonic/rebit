"""
Jobs API router.

Provides endpoints for querying job status and pipeline progress.
Used by the frontend to poll for real-time updates during processing.
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Job, PipelineStep, Segment, Transcript, SiaLog

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

    return [
        {
            "id": job.id,
            "status": job.status,
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
                    "completedAt": step.completed_at.isoformat() if step.completed_at else None,
                }
                for step in (await db.execute(
                    select(PipelineStep)
                    .where(PipelineStep.job_id == job.id)
                    .order_by(PipelineStep.started_at.asc().nullsfirst(), PipelineStep.stage)
                )).scalars().all()
            ],
            "segmentCount": len(
                (await db.execute(
                    select(Segment).where(Segment.job_id == job.id)
                )).scalars().all()
            ),
        }
        for job in jobs
    ]


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
        select(SiaLog)
        .where(SiaLog.job_id == job_id)
        .order_by(SiaLog.ts.asc())
    )
    sia_logs = sia_logs_result.scalars().all()

    return {
        "id": job.id,
        "status": job.status,
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
                "completedAt": step.completed_at.isoformat() if step.completed_at else None,
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
        "transcript": {
            "id": transcript.id,
            "wordCount": len(transcript.vtt_content.split()) if transcript else 0,
            "createdAt": transcript.created_at.isoformat() if transcript else None,
        } if transcript else None,
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
    """
    try:
        result = await db.execute(select(Job).where(Job.id == job_id))
        job = result.scalar_one_or_none()

        if not job:
            raise HTTPException(status_code=404, detail=f"Job {job_id} not found")

        # Delete related records manually (SQLAlchemy doesn't mirror Prisma's onDelete: Cascade)
        from sqlalchemy import delete as sa_delete

        await db.execute(sa_delete(PipelineStep).where(PipelineStep.job_id == job_id))
        await db.execute(sa_delete(Segment).where(Segment.job_id == job_id))
        await db.execute(sa_delete(Transcript).where(Transcript.job_id == job_id))
        await db.execute(sa_delete(SiaLog).where(SiaLog.job_id == job_id))

        # Now delete the job itself
        await db.delete(job)
        await db.commit()

        logger.info(f"Job {job_id} deleted")

        return {"ok": True, "jobId": job_id}
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Failed to delete job {job_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete job: {str(e)}")


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
        "status": job.status,
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

    # Kick off the pipeline in the background
    from app.services.pipeline_orchestrator import run_pipeline_async
    import asyncio
    asyncio.create_task(run_pipeline_async(job_id, start_from))

    logger.info(f"Pipeline manually started for job {job_id} (start_from={start_from})")

    return {
        "jobId": job_id,
        "status": "started",
        "message": f"Pipeline started from stage: {start_from or 'beginning'}",
    }