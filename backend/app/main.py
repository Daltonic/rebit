"""
FastAPI application entry point.

Initializes the database connection, registers routers,
and sets up CORS for the Next.js frontend.
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sse_starlette.sse import EventSourceResponse

from app.config import settings
from app.database import wait_for_migrated_schema, close_db, async_session_factory
from app.routers import pipeline, sia, upload, url_import, jobs, clips
from app.services import sia_client

# ── Logging ──────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO if not settings.debug else logging.DEBUG,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


# ── Lifespan ─────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown."""
    logger.info("Starting ReBit backend...")

    # Create required directories
    settings.upload_path.mkdir(parents=True, exist_ok=True)
    settings.output_path.mkdir(parents=True, exist_ok=True)

    # Wait for the frontend's Prisma migrations to have run. The backend
    # never creates or alters schema itself — see database.py for why.
    # This intentionally raises (crashing startup) instead of swallowing
    # the error, so a missing/behind migration fails loudly here instead
    # of surfacing later as confusing per-query errors.
    await wait_for_migrated_schema()

    # Initialize Sia client from database (startup fast-path)
    # If a stored AppKey exists on disk, this will connect without user interaction.
    # Otherwise, it gracefully enters demo mode until the setup wizard is run.
    try:
        async with async_session_factory() as db:
            sia_result = await sia_client.init_sia_from_db(db)
            if sia_result.get("connected"):
                logger.info("Sia connected via stored AppKey — fast-path reconnection successful")
            elif sia_result.get("demo"):
                logger.info(f"Sia in demo mode: {sia_result.get('reason', 'not configured')}")
            else:
                logger.info("Sia not connected — setup wizard required")
    except Exception as e:
        logger.warning(f"Sia initialization skipped: {e}")

    yield

    # Shutdown
    await close_db()
    logger.info("ReBit backend shut down")


# ── App Factory ──────────────────────────────────────────────────────────

app = FastAPI(
    title="ReBit Backend",
    description="Decentralized Video Clipping Engine — FastAPI backend",
    version="0.1.0",
    lifespan=lifespan,
)

# ── CORS ─────────────────────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ──────────────────────────────────────────────────────────────

app.include_router(pipeline.router)
app.include_router(sia.router)
app.include_router(upload.router)
app.include_router(url_import.router)
app.include_router(jobs.router)
app.include_router(clips.router)


# ── Health Check ─────────────────────────────────────────────────────────

@app.get("/health")
async def health_check():
    """Health check endpoint."""
    from app.schemas import HealthResponse
    sia_status = sia_client.get_status()
    return HealthResponse(
        status="ok",
        version="0.1.0",
        sia_mode="demo" if sia_status["demo"] else "live",
        sia_connected=sia_status["connected"],
    )


# ── Pipeline SSE Events ──────────────────────────────────────────────────

import asyncio
import json
import logging

from app.services.pipeline_events import subscribe as subscribe_events
from app.models import Job, PipelineStep
from app.database import async_session_factory
from sqlalchemy import select

sse_logger = logging.getLogger("sse")


@app.get("/api/jobs/{job_id}/events")
async def job_pipeline_events(job_id: str):
    """
    SSE endpoint for real-time pipeline progress.

    The frontend connects to this to receive live pipeline updates
    without polling. Events are pushed instantly as stages progress.

    Event types:
      - "connected": Sent on successful connection.
      - "step_update": Pipeline step progress changed.
      - "job_status": Overall job status changed.
      - "pipeline_complete": All stages finished.
      - "keepalive": Sent every 30s to keep connection alive.

    Falls back to polling (5s interval) if SSE is unavailable.
    """
    async def event_generator():
        try:
            # Send initial state so the frontend has immediate data
            try:
                async with async_session_factory() as db:
                    result = await db.execute(select(Job).where(Job.id == job_id))
                    job = result.scalar_one_or_none()
                    if job:
                        yield {'data': json.dumps({'type': 'job_status', 'status': job.status, 'message': ''})}

                        steps_result = await db.execute(
                            select(PipelineStep)
                            .where(PipelineStep.job_id == job_id)
                            .order_by(PipelineStep.started_at.asc().nullsfirst(), PipelineStep.stage)
                        )
                        for step in steps_result.scalars().all():
                            yield {'data': json.dumps({
                                'type': 'step_update',
                                'stage': step.stage,
                                'status': step.status,
                                'progressPct': step.progress_pct,
                                'message': step.message,
                            })}
            except Exception as e:
                sse_logger.warning(f"Could not send initial state for {job_id}: {e}")

            # Stream live events
            async for event in subscribe_events(job_id):
                yield {'data': json.dumps(event)}

        except asyncio.CancelledError:
            sse_logger.debug(f"SSE connection closed for job {job_id}")
            pass

    return EventSourceResponse(event_generator())


# ── Entry Point ──────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.debug,
        log_level="info" if not settings.debug else "debug",
    )