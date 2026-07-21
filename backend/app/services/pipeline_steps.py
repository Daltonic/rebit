"""
Single source of truth for writing PipelineStep rows.

Every stage used to hand-roll its own "SELECT, then INSERT-or-UPDATE"
logic. Under concurrency (two pipeline runs for the same job, or a
stage function racing a progress-update helper that opened its own
session) that pattern creates duplicate rows: two sessions both SELECT,
both see nothing, both INSERT.

This module replaces all of that with one function that does a real
Postgres UPSERT (INSERT ... ON CONFLICT DO UPDATE), relying on a unique
constraint on (job_id, stage). The database itself now guarantees there
can only ever be one row per (job, stage) — no race is possible, because
there's no read-then-write gap left to race in.

Usage (identical call signature to the old `_update_step` helpers that
were duplicated across transcribe.py, extract.py, render.py, sia.py,
sia_upload.py, and detect.py):

    from app.services.pipeline_steps import upsert_pipeline_step
    await upsert_pipeline_step(db, job_id, "transcribe", "running", 30, "Extracting audio...")
"""

import logging
from datetime import datetime, timezone

from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import PipelineStep
from app.services.pipeline_events import publish_step_update

logger = logging.getLogger(__name__)

# Maps a pipeline stage to the Job.status value that should be shown
# while that stage is running. This is the ONLY place that mapping is
# defined — stage code (transcribe.py, detect.py, etc.) should no
# longer set job.status directly. Having five different files each set
# job.status at the end of their own stage is exactly what caused the
# frontend to show "Upload complete" while detect was actually running:
# job.status only ever reflected whichever stage most recently
# finished, never the one currently in progress.
STAGE_TO_JOB_STATUS = {
    "sia_upload": "uploading",
    "transcribe": "transcribing",
    "detect": "detecting",
    "extract": "extracting",
    "render": "rendering",
    "sia_store": "storing",
}


async def upsert_pipeline_step(
    db: AsyncSession,
    job_id: str,
    stage: str,
    status: str,
    progress_pct: int,
    message: str,
    *,
    reset_started_at: bool = False,
    publish: bool = True,
) -> None:
    """
    Create or update a PipelineStep row atomically, then publish an
    SSE progress event so the frontend updates in real time.

    Args:
        db: the pipeline's single active session (never opens a new one).
        reset_started_at: pass True only for the transition that starts
            (or restarts) a stage. Progress updates *within* an already-
            running stage should leave the original started_at alone,
            otherwise the elapsed-time shown in the UI keeps resetting.
            When retrying a previously-failed stage, this should be True
            so the old failed attempt's duration doesn't get counted
            against the new attempt (this is what caused "Detect
            Highlights" to show 61m 34s elapsed for 0.3s of real work —
            started_at was never reset across a retry).
        publish: set False to skip the SSE event (rarely needed).
    """
    now = datetime.now(timezone.utc)

    new_started_at = now if status == "running" else None
    new_completed_at = now if status in ("complete", "failed") else None

    stmt = pg_insert(PipelineStep).values(
        job_id=job_id,
        stage=stage,
        status=status,
        progress_pct=progress_pct,
        message=message,
        started_at=new_started_at,
        completed_at=new_completed_at,
    )

    set_ = {
        "status": stmt.excluded.status,
        "progress_pct": stmt.excluded.progress_pct,
        "message": stmt.excluded.message,
    }

    if status == "running":
        if reset_started_at:
            set_["started_at"] = stmt.excluded.started_at
            set_["completed_at"] = None
        else:
            # Keep the existing started_at if this stage already has one;
            # only set it if this is genuinely the first "running" update.
            set_["started_at"] = func.coalesce(PipelineStep.started_at, stmt.excluded.started_at)
    elif status in ("complete", "failed"):
        set_["completed_at"] = stmt.excluded.completed_at

    stmt = stmt.on_conflict_do_update(
        index_elements=["job_id", "stage"],
        set_=set_,
    )

    try:
        await db.execute(stmt)
    except Exception:
        logger.exception(f"Failed to upsert pipeline step {job_id}/{stage}")
        raise

    if publish:
        try:
            await publish_step_update(job_id, stage, status, progress_pct, message)
        except Exception as e:
            logger.warning(f"Failed to publish SSE event for {job_id}/{stage}: {e}")
