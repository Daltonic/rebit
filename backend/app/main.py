"""
FastAPI application entry point.

Initializes the database connection, registers routers,
and sets up CORS for the Next.js frontend.
"""

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sse_starlette.sse import EventSourceResponse

from backend.app.config import settings
from backend.app.database import init_db, close_db, async_session_factory
from backend.app.models import AppSettings
from backend.app.routers import pipeline, sia
from backend.app.services import sia_client

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

    # Initialize database
    try:
        await init_db()
        logger.info("Database initialized")
    except Exception as e:
        logger.warning(f"Database initialization skipped (may not exist yet): {e}")

    # Log Sia mode
    if settings.is_demo_mode:
        logger.info("Sia running in DEMO mode — no actual storage")
    else:
        logger.info(f"Sia configured in LIVE mode (indexer: {settings.sia_indexer_url})")

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


# ── Health Check ─────────────────────────────────────────────────────────

@app.get("/health")
async def health_check():
    """Health check endpoint."""
    from backend.app.schemas import HealthResponse
    return HealthResponse(
        status="ok",
        version="0.1.0",
        sia_mode=settings.sia_mode,
        sia_connected=not settings.is_demo_mode and bool(settings.sia_indexer_url),
    )


# ── SSE Events ───────────────────────────────────────────────────────────

import asyncio
import json


@app.get("/api/sia/events")
async def sia_events():
    """
    SSE endpoint for real-time Sia status updates.
    The frontend connects to this to receive live pipeline progress.
    """
    async def event_generator():
        try:
            while True:
                # In a real implementation, this would read from a
                # pub/sub channel or queue. For now, send keepalive.
                data = json.dumps({"type": "keepalive", "timestamp": asyncio.get_event_loop().time()})
                yield f"data: {data}\n\n"
                await asyncio.sleep(15)
        except asyncio.CancelledError:
            pass

    return EventSourceResponse(event_generator())


# ── Entry Point ──────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "backend.app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.debug,
        log_level="info" if not settings.debug else "debug",
    )