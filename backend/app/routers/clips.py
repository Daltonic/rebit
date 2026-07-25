"""
Clips API router.

Provides endpoints for serving extracted/rendered clip files to the frontend
for playback. Clips can be served from:
  1. Local filesystem (clip_path on the Segment model)
  2. Sia network (via the Sia SDK, if connected)
"""

import logging
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Segment
from app.services import sia_client

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/jobs/{job_id}/clips", tags=["clips"])


@router.get("/{segment_id}")
async def serve_clip(
    job_id: str,
    segment_id: str,
    db: AsyncSession = Depends(get_db),
):
    """
    GET /api/jobs/{job_id}/clips/{segment_id}

    Serves a clip video file for playback. Tries the following sources in order:
      1. Local filesystem (segment.clip_path)
      2. Sia network (segment.sia_object_id, if Sia SDK is connected)

    Returns the video file with the appropriate Content-Type header.
    """
    # Fetch the segment
    result = await db.execute(
        select(Segment).where(
            Segment.id == segment_id,
            Segment.job_id == job_id,
        )
    )
    segment = result.scalar_one_or_none()

    if not segment:
        raise HTTPException(status_code=404, detail="Segment not found")

    # Strategy 1: Serve from local filesystem
    if segment.clip_path:
        clip_path = Path(segment.clip_path)
        if clip_path.exists():
            logger.info(f"Serving clip {segment_id} from local filesystem: {clip_path}")
            return FileResponse(
                path=str(clip_path),
                media_type="video/mp4",
                filename=clip_path.name,
            )
        else:
            logger.warning(f"clip_path exists in DB but file not found: {clip_path}")

    # Strategy 2: Serve from Sia network
    if segment.sia_object_id:
        sdk = await sia_client.get_sdk()
        if sdk is not None:
            try:
                logger.info(f"Fetching clip {segment_id} from Sia: {segment.sia_object_id}")
                # Get the object from Sia
                sia_obj = await sdk.object(segment.sia_object_id)
                # Download the data
                data = await sia_obj.data()
                return Response(
                    content=data,
                    media_type="video/mp4",
                    headers={
                        "Content-Disposition": f'inline; filename="clip_{segment_id}.mp4"',
                    },
                )
            except Exception as e:
                logger.error(f"Failed to fetch clip {segment_id} from Sia: {e}")
                raise HTTPException(
                    status_code=502,
                    detail=f"Failed to fetch clip from Sia: {str(e)}",
                )
        else:
            logger.warning(f"Sia object ID exists ({segment.sia_object_id}) but Sia SDK is not connected")
            raise HTTPException(
                status_code=503,
                detail="Clip is stored on Sia but Sia is not connected",
            )

    # No source available
    raise HTTPException(
        status_code=404,
        detail="No clip file available for this segment",
    )