"""
Pipeline orchestration service.

Coordinates the full pipeline execution for a job:
  1. transcribe  —  Speech-to-text via Whisper (real implementation)
  2. detect     —  Highlight/segment detection from transcript (real)
  3. extract    —  Clip extraction via ffmpeg (real)
  4. render     —  Vertical 9:16 format rendering (real)
  5. sia_store  —  Store all artifacts on Sia (real)

Each step updates the pipeline_steps table with progress so the frontend
can poll for real-time status updates.

The initial Sia upload (step 0) happens in the upload router itself,
before any of these pipeline steps begin.
"""

import logging
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session_factory
from app.models import Job, PipelineStep
from app.services.transcribe import transcribe_job
from app.services.detect import detect_highlights
from app.services.extract import extract_clips
from app.services.render import render_clips
from app.services.sia import store_job_artifacts

logger = logging.getLogger(__name__)

# ── Pipeline Stage Definitions ────────────────────────────────────────────

STAGES = [
    {
        "stage": "transcribe",
        "name": "Transcription",
        "func": transcribe_job,
        "description": "Transcribing audio to text with Whisper...",
    },
    {
        "stage": "detect",
        "name": "Highlight Detection",
        "func": detect_highlights,
        "description": "Detecting highlight segments from transcript...",
    },
    {
        "stage": "extract",
        "name": "Clip Extraction",
        "func": extract_clips,
        "description": "Extracting video clips for detected segments...",
    },
    {
        "stage": "render",
        "name": "Vertical Render",
        "func": render_clips,
        "description": "Rendering clips as 9:16 short-form videos...",
    },
    {
        "stage": "sia_store",
        "name": "Sia Storage",
        "func": store_job_artifacts,
        "description": "Storing all artifacts on Sia decentralized network...",
    },
]


async def run_pipeline(
    job_id: str,
    db: AsyncSession,
    start_from: Optional[str] = None,
) -> dict:
    """
    Run the full pipeline for a job, executing each stage sequentially.

    Args:
        job_id: The job ID to process.
        db: Database session.
        start_from: Optional stage name to start from (for retries).

    Returns:
        dict with overall pipeline result.
    """
    job_result = await db.execute(select(Job).where(Job.id == job_id))
    job = job_result.scalar_one_or_none()

    if not job:
        return {"passed": False, "message": f"Job {job_id} not found"}

    logger.info(f"Starting pipeline for job {job_id}")

    # Determine which stages to run
    should_run = False
    stages_to_run = []

    for stage_def in STAGES:
        stage_name = stage_def["stage"]

        if start_from:
            # Start from the specified stage
            if stage_name == start_from:
                should_run = True
            if not should_run:
                continue

        stages_to_run.append(stage_def)

    # If no start_from specified, run all stages
    if not start_from:
        stages_to_run = STAGES

    # Execute each stage
    for stage_def in stages_to_run:
        stage_name = stage_def["stage"]
        stage_func = stage_def["func"]

        # Check if this stage is already complete (skip if so)
        step_result = await db.execute(
            select(PipelineStep).where(
                PipelineStep.job_id == job_id,
                PipelineStep.stage == stage_name,
                PipelineStep.status == "complete",
            )
        )
        if step_result.scalar_one_or_none():
            logger.info(f"Stage '{stage_name}' already complete for job {job_id}, skipping")
            continue

        # Check if this stage already has a pipeline_step record
        step_result = await db.execute(
            select(PipelineStep).where(
                PipelineStep.job_id == job_id,
                PipelineStep.stage == stage_name,
            )
        )
        existing_step = step_result.scalar_one_or_none()

        if not existing_step:
            # Create the step record as pending
            db.add(PipelineStep(
                job_id=job_id,
                stage=stage_name,
                status="pending",
                progress_pct=0,
                message=f"Waiting for {stage_def['description']}",
            ))
            await db.flush()

        try:
            logger.info(f"Running stage '{stage_name}' for job {job_id}")
            result = await stage_func(job_id, db)

            if result.get("passed"):
                logger.info(f"Stage '{stage_name}' completed successfully for job {job_id}")
            else:
                error_msg = result.get("message", f"Stage '{stage_name}' failed")
                logger.error(f"Pipeline stage '{stage_name}' failed for job {job_id}: {error_msg}")
                return {
                    "passed": False,
                    "message": error_msg,
                    "failed_stage": stage_name,
                }

        except Exception as e:
            logger.error(f"Pipeline stage '{stage_name}' threw exception for job {job_id}: {e}")
            # Mark the step as failed
            step_result = await db.execute(
                select(PipelineStep).where(
                    PipelineStep.job_id == job_id,
                    PipelineStep.stage == stage_name,
                )
            )
            step = step_result.scalar_one_or_none()
            if step:
                step.status = "failed"
                step.progress_pct = 0
                step.message = f"Failed: {str(e)[:200]}"
                step.completed_at = datetime.now(timezone.utc)
                await db.flush()

            return {
                "passed": False,
                "message": f"Pipeline stage '{stage_name}' failed: {str(e)}",
                "failed_stage": stage_name,
            }

    # All stages complete
    job.status = "complete"
    await db.flush()

    logger.info(f"Pipeline complete for job {job_id}")
    return {
        "passed": True,
        "message": "All pipeline stages completed successfully",
    }


async def run_pipeline_async(job_id: str, start_from: Optional[str] = None):
    """
    Run the pipeline in the background (non-blocking).
    
    Creates its own database session so it doesn't hold up the request.
    This is used by the upload endpoint to kick off the pipeline without
    waiting for it to finish.
    """
    try:
        async with async_session_factory() as db:
            result = await run_pipeline(job_id, db, start_from)
            await db.commit()

            if result["passed"]:
                logger.info(f"Async pipeline completed successfully for job {job_id}")
            else:
                logger.error(f"Async pipeline failed for job {job_id}: {result['message']}")
    except Exception as e:
        logger.error(f"Async pipeline crashed for job {job_id}: {e}")