"""
Pipeline API router.

Each endpoint corresponds to a pipeline stage that the Inngest frontend
calls via POST /api/{stage}. The stages are:
  - transcribe:  Speech-to-text via Whisper
  - detect:      Highlight/segment detection
  - extract:     Clip extraction via ffmpeg
  - render:      Vertical format rendering
  - sia:         Sia decentralized storage
"""

import logging

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas import (
    PipelineRequest,
    PipelineResponse,
    TranscribeRequest,
    TranscribeResponse,
    DetectRequest,
    DetectResponse,
    ExtractRequest,
    ExtractResponse,
    RenderRequest,
    RenderResponse,
    SiaStoreRequest,
    SiaStoreResponse,
)
from app.services.transcribe import transcribe_job
from app.services.detect import detect_highlights
from app.services.extract import extract_clips
from app.services.render import render_clips
from app.services.sia import store_job_artifacts

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["pipeline"])


@router.post("/transcribe", response_model=TranscribeResponse)
async def api_transcribe(
    body: TranscribeRequest,
    db: AsyncSession = Depends(get_db),
):
    """Stage 1: Transcribe video to text using Whisper."""
    result = await transcribe_job(body.job_id, db)
    return TranscribeResponse(
        passed=result["passed"],
        message=result["message"],
        duration_seconds=result.get("duration_seconds"),
        word_count=result.get("word_count"),
    )


@router.post("/detect", response_model=DetectResponse)
async def api_detect(
    body: DetectRequest,
    db: AsyncSession = Depends(get_db),
):
    """Stage 2: Detect highlight segments from transcript."""
    result = await detect_highlights(body.job_id, db)
    return DetectResponse(
        passed=result["passed"],
        message=result["message"],
        segments_count=result.get("segments_count", 0),
    )


@router.post("/extract", response_model=ExtractResponse)
async def api_extract(
    body: ExtractRequest,
    db: AsyncSession = Depends(get_db),
):
    """Stage 3: Extract video clips for detected segments."""
    result = await extract_clips(body.job_id, db)
    return ExtractResponse(
        passed=result["passed"],
        message=result["message"],
        clips_rendered=result.get("clips_rendered", 0),
    )


@router.post("/render", response_model=RenderResponse)
async def api_render(
    body: RenderRequest,
    db: AsyncSession = Depends(get_db),
):
    """Stage 4: Render clips as vertical short-form videos."""
    result = await render_clips(body.job_id, db)
    return RenderResponse(
        passed=result["passed"],
        message=result["message"],
        clips_rendered=result.get("clips_rendered", 0),
    )


@router.post("/sia", response_model=SiaStoreResponse)
async def api_sia_store(
    body: SiaStoreRequest,
    db: AsyncSession = Depends(get_db),
):
    """Stage 5: Store all artifacts on Sia decentralized storage."""
    result = await store_job_artifacts(body.job_id, db)
    return SiaStoreResponse(
        passed=result["passed"],
        message=result["message"],
        sia_hash=result.get("sia_hash"),
        sia_status=result.get("sia_status", "pending"),
    )