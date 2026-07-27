"""
Pipeline orchestration service.

Coordinates the full pipeline execution for a job:
  0. sia_upload  —  Upload source video to Sia Network
  1. transcribe  —  Speech-to-text via Whisper
  2. detect      —  Highlight/segment detection from transcript
  3. extract     —  Clip extraction via ffmpeg
  4. render      —  Vertical 9:16 format rendering
  5. sia_store   —  Store all artifacts on Sia

Each step updates the pipeline_steps table with progress so the frontend
can poll for real-time status updates. Stages run sequentially — each
stage must complete before the next one begins.

── Concurrency ───────────────────────────────────────────────────────────
`start_pipeline_task()` is the ONLY supported way to kick off pipeline
execution. It atomically acquires a per-job lock (Job.pipeline_lock_at)
before spawning the background task, so calling it twice in a row for
the same job — e.g. the auto-start after upload racing a user's "Resume
pipeline" click — results in exactly one execution, not two or three
running concurrently against the same rows. See PIPELINE_LOCK_STALE_AFTER
below for what happens if a run crashes without releasing the lock.
"""

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session_factory
from app.models import Job, PipelineStep
from app.services.pipeline_steps import upsert_pipeline_step, STAGE_TO_JOB_STATUS
from app.services.pipeline_events import publish_job_status
from app.services.sia_upload import upload_source_to_sia
from app.services.transcribe import transcribe_job
from app.services.detect import detect_highlights
from app.services.extract import extract_clips
from app.services.render import render_clips
from app.services.sia import store_job_artifacts

logger = logging.getLogger(__name__)

# ── Pipeline Stage Definitions ────────────────────────────────────────────
# Stages run in order. Each stage must complete before the next begins.

STAGES = [
    {
        "stage": "sia_upload",
        "name": "Sia Upload",
        "func": upload_source_to_sia,
        "description": "Uploading source video to Sia Network...",
    },
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

# Per-stage timeout, in seconds. Every stage function is awaited under
# asyncio.wait_for() using this table — without it, a hung subprocess
# (ffmpeg choking on an unusual codec, Whisper never returning, a stuck
# network call) blocks the pipeline task forever. Nothing else in this
# file was actually enforcing these numbers before; they only existed
# as a comment on PIPELINE_LOCK_STALE_AFTER describing what "should"
# happen, which is exactly how a job can sit at "running" for 60+
# minutes with no error and no way out except deleting the project.
STAGE_TIMEOUTS = {
    "sia_upload": 300,  # 5 min
    "transcribe": 600,  # 10 min
    "detect": 300,  # 5 min
    "extract": 300,  # 5 min per ffmpeg extraction pass
    "render": 300,  # 5 min per ffmpeg render pass
    "sia_store": 300,  # 5 min
}
DEFAULT_STAGE_TIMEOUT = 300

# If a lock is older than this, treat it as abandoned (the process that
# held it almost certainly crashed or was killed) and allow re-acquisition
# rather than wedging the job forever. Generously above the sum of every
# stage's own internal timeout (transcribe: 10min, detect: 5min, ffmpeg
# steps: a few minutes each).
PIPELINE_LOCK_STALE_AFTER = timedelta(minutes=20)


async def _try_acquire_lock(job_id: str) -> bool:
    """
    Atomically claim the pipeline lock for a job.

    This is a single UPDATE with the acquisition condition in the WHERE
    clause, not a SELECT followed by an UPDATE — that gap is exactly what
    let multiple pipeline tasks run concurrently before. Only one caller
    can ever have their UPDATE match the row (Postgres serializes
    concurrent UPDATEs to the same row), so only one caller gets
    rowcount == 1 back.
    """
    now = datetime.now(timezone.utc)
    stale_cutoff = now - PIPELINE_LOCK_STALE_AFTER

    async with async_session_factory() as db:
        result = await db.execute(
            update(Job)
            .where(
                Job.id == job_id,
                or_(
                    Job.pipeline_lock_at.is_(None), Job.pipeline_lock_at < stale_cutoff
                ),
            )
            .values(pipeline_lock_at=now)
        )
        await db.commit()
        return result.rowcount > 0


async def _release_lock(job_id: str) -> None:
    """Release the pipeline lock so a future run (retry, next stage) can proceed."""
    async with async_session_factory() as db:
        await db.execute(
            update(Job).where(Job.id == job_id).values(pipeline_lock_at=None)
        )
        await db.commit()


async def start_pipeline_task(job_id: str, start_from: Optional[str] = None) -> dict:
    """
    Public entry point for launching pipeline execution in the background.

    Safe to call multiple times concurrently for the same job — e.g. the
    auto-start right after upload racing a "Resume pipeline" click. Only
    the caller that wins the lock actually spawns a task; everyone else
    gets {"started": False} back immediately and does nothing further.

    This replaces the old pattern of every call site doing its own
    `asyncio.create_task(run_pipeline_async(job_id))`, which had no
    coordination between call sites at all.
    """
    acquired = await _try_acquire_lock(job_id)
    if not acquired:
        logger.info(
            f"Pipeline already running for job {job_id}; ignoring duplicate start request"
        )
        return {"started": False, "message": "Pipeline is already running for this job"}

    asyncio.create_task(_run_locked(job_id, start_from))
    return {
        "started": True,
        "message": f"Pipeline started from stage: {start_from or 'beginning'}",
    }


async def _run_locked(job_id: str, start_from: Optional[str]) -> None:
    """Runs the pipeline, guaranteeing the lock is released no matter what happens."""
    try:
        async with async_session_factory() as db:
            result = await run_pipeline(job_id, db, start_from)
            await db.commit()

            if result["passed"]:
                logger.info(f"Pipeline completed successfully for job {job_id}")
            else:
                logger.error(f"Pipeline failed for job {job_id}: {result['message']}")
    except Exception as e:
        logger.error(f"Pipeline crashed for job {job_id}: {e}")
    finally:
        await _release_lock(job_id)


async def run_pipeline(
    job_id: str,
    db: AsyncSession,
    start_from: Optional[str] = None,
) -> dict:
    """
    Run the full pipeline for a job, executing each stage sequentially.

    This function assumes the caller already holds the pipeline lock for
    this job (start_pipeline_task() guarantees that). It should not be
    called directly from request handlers — use start_pipeline_task().

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
            if stage_name == start_from:
                should_run = True
            if not should_run:
                continue

        stages_to_run.append(stage_def)

    if not start_from:
        stages_to_run = STAGES

    # Execute each stage sequentially
    for stage_def in stages_to_run:
        stage_name = stage_def["stage"]
        stage_func = stage_def["func"]

        # ── Check if this stage is already complete ──────────────────────
        step_result = await db.execute(
            select(PipelineStep).where(
                PipelineStep.job_id == job_id,
                PipelineStep.stage == stage_name,
                PipelineStep.status == "complete",
            )
        )
        if step_result.scalar_one_or_none():
            logger.info(
                f"Stage '{stage_name}' already complete for job {job_id}, skipping"
            )
            continue

        # ── Mark as running. reset_started_at=True because this is a genuine
        # (re)start of the stage — if a previous attempt failed, its stale
        # started_at should not be counted toward this attempt's elapsed time.
        await upsert_pipeline_step(
            db,
            job_id,
            stage_name,
            "running",
            5,
            stage_def["description"],
            reset_started_at=True,
        )
        job.status = STAGE_TO_JOB_STATUS.get(stage_name, job.status)
        await db.flush()
        # Commit now (not just at pipeline end) so any other session —
        # a GET /api/jobs/{id} request, this SSE endpoint's initial
        # snapshot — can actually see the new status, then tell any
        # live subscribers about it. publish_job_status() previously
        # existed but was never called anywhere, which is the whole
        # reason the frontend never learned to refetch on its own.
        await db.commit()
        await db.refresh(job)
        await publish_job_status(job_id, job.status, stage_def["description"])
        logger.info(f"Stage '{stage_name}' now running for job {job_id}")

        # ── Execute the stage ────────────────────────────────────────────
        timeout = STAGE_TIMEOUTS.get(stage_name, DEFAULT_STAGE_TIMEOUT)
        try:
            result = await asyncio.wait_for(stage_func(job_id, db), timeout=timeout)

            if result.get("passed"):
                logger.info(
                    f"Stage '{stage_name}' completed successfully for job {job_id}"
                )
            else:
                error_msg = result.get("message", f"Stage '{stage_name}' failed")
                logger.error(
                    f"Pipeline stage '{stage_name}' failed for job {job_id}: {error_msg}"
                )
                job.status = "failed"
                await db.flush()
                await db.commit()
                await publish_job_status(job_id, "failed", error_msg)
                return {
                    "passed": False,
                    "message": error_msg,
                    "failed_stage": stage_name,
                }

        except asyncio.TimeoutError:
            error_msg = f"Stage '{stage_name}' timed out after {timeout}s"
            logger.error(
                f"Pipeline stage '{stage_name}' timed out for job {job_id} after {timeout}s"
            )
            await upsert_pipeline_step(
                db,
                job_id,
                stage_name,
                "failed",
                0,
                error_msg,
            )
            job.status = "failed"
            await db.flush()
            await db.commit()
            await publish_job_status(job_id, "failed", error_msg)

            return {
                "passed": False,
                "message": error_msg,
                "failed_stage": stage_name,
            }

        except Exception as e:
            logger.error(
                f"Pipeline stage '{stage_name}' threw exception for job {job_id}: {e}"
            )
            await upsert_pipeline_step(
                db,
                job_id,
                stage_name,
                "failed",
                0,
                f"Failed: {str(e)[:200]}",
            )
            job.status = "failed"
            await db.flush()
            await db.commit()
            error_msg = f"Pipeline stage '{stage_name}' failed: {str(e)}"
            await publish_job_status(job_id, "failed", error_msg)

            return {
                "passed": False,
                "message": error_msg,
                "failed_stage": stage_name,
            }

    # All stages complete
    job.status = "complete"
    await db.flush()
    await db.commit()
    await publish_job_status(job_id, "complete", "All stages finished")

    logger.info(f"Pipeline complete for job {job_id}")
    return {
        "passed": True,
        "message": "All pipeline stages completed successfully",
    }
