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

IMPORTANT — do not write to the Job table from here.
An earlier version of this file also wrote Job.status from a second,
short-lived session so the frontend would see status changes right
away. That created a deadlock: pipeline_orchestrator.py holds one
database session open for the entire job and takes a row-level lock on
that same Job row the first time it touches job.status, then doesn't
release it until the whole pipeline commits at the end. The moment
this module's second session tried to update the same row mid-run, it
sat blocked indefinitely waiting on a lock the orchestrator's session
wouldn't release until the job was already finished — which is exactly
why the job looked stuck on stage one with no error in the logs.

The fix: this module only ever writes PipelineStep rows (safe, nothing
else holds a lock on that table) and commits them immediately. Job
status is no longer stored or written per-stage at all. Instead, it's
computed on read, by looking at the current PipelineStep rows for a
job. Call get_job_status_from_steps() (or job_status_from_step_rows()
if you already have the rows) wherever job.status used to be read —
most likely the GET /api/jobs/{job_id} handler and anywhere else that
currently does `job.status`.
"""

import logging
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session_factory
from app.models import PipelineStep
from app.services.pipeline_events import publish_step_update

logger = logging.getLogger(__name__)

# Maps a pipeline stage to the human-readable status that should be
# shown while that stage is running. This is the ONLY place that
# mapping is defined — stage code (transcribe.py, detect.py, etc.)
# should not set any job-level status directly.
STAGE_TO_JOB_STATUS = {
    "sia_upload": "uploading",
    "transcribe": "transcribing",
    "detect": "detecting",
    "extract": "extracting",
    "render": "rendering",
    "sia_store": "storing",
}

# Order matters here: it's the order stages run in, and it's what lets
# job_status_from_step_rows() figure out which stage is "current" when
# more than one row exists.
STAGE_ORDER = list(STAGE_TO_JOB_STATUS.keys())


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
        db: kept for call-site compatibility; not used for the actual
            write (see the visibility-fix note in the module docstring
            for why).
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
            set_["started_at"] = func.coalesce(
                PipelineStep.started_at, stmt.excluded.started_at
            )
    elif status in ("complete", "failed"):
        set_["completed_at"] = stmt.excluded.completed_at

    stmt = stmt.on_conflict_do_update(
        index_elements=["job_id", "stage"],
        set_=set_,
    )

    try:
        # This session only ever touches PipelineStep, never Job. That's
        # what keeps it safe to commit immediately without racing the
        # orchestrator's long-running session (see module docstring).
        async with async_session_factory() as visibility_db:
            await visibility_db.execute(stmt)
            await visibility_db.commit()
    except Exception:
        logger.exception(f"Failed to upsert pipeline step {job_id}/{stage}")
        raise

    if publish:
        try:
            await publish_step_update(job_id, stage, status, progress_pct, message)
        except Exception as e:
            logger.warning(f"Failed to publish SSE event for {job_id}/{stage}: {e}")


def job_status_from_step_rows(steps: list[PipelineStep]) -> str:
    """
    Compute a job-level status string purely from already-fetched
    PipelineStep rows. No database access here, so call this after
    you've already queried the steps for other reasons (e.g. to build
    the pipeline tracker payload) instead of querying twice.

    Rules, in priority order:
    1. Any stage "failed" -> "failed"
    2. Any stage "running" -> the STAGE_TO_JOB_STATUS label for that stage
    3. No rows yet at all -> "queued"
    4. Every known stage present and "complete" -> "complete"
    5. Otherwise (some stages done, next one hasn't inserted its first
       row yet) -> the label for the earliest missing/incomplete stage,
       so the UI shows "Transcribing" during the gap between "sia_upload
       complete" and "transcribe" inserting its own "running" row.
    """
    if not steps:
        return "queued"

    by_stage = {s.stage: s for s in steps}

    for s in steps:
        if s.status == "failed":
            return "failed"

    for s in steps:
        if s.status == "running":
            return STAGE_TO_JOB_STATUS.get(s.stage, "processing")

    for stage in STAGE_ORDER:
        row = by_stage.get(stage)
        if row is None or row.status != "complete":
            return STAGE_TO_JOB_STATUS.get(stage, "processing")

    return "complete"


async def get_job_status_from_steps(job_id: str) -> str:
    """
    Convenience wrapper for call sites that don't already have the
    PipelineStep rows loaded (e.g. a lightweight status-only endpoint).
    Opens its own short-lived read, so it's safe to call from anywhere,
    including while the orchestrator's long session is open elsewhere.
    """
    async with async_session_factory() as read_db:
        result = await read_db.execute(
            select(PipelineStep).where(PipelineStep.job_id == job_id)
        )
        steps = result.scalars().all()
    return job_status_from_step_rows(list(steps))
