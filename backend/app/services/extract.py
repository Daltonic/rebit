"""
Clip extraction service.

Uses ffmpeg to extract video segments based on detected highlights.
Creates vertical (9:16) short-form clips from the original video.
"""

import logging
import subprocess
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import Job, Segment, PipelineStep
from app.services.pipeline_steps import upsert_pipeline_step

logger = logging.getLogger(__name__)


async def extract_clips(
    job_id: str,
    db: AsyncSession,
) -> dict:
    """
    Extract video clips for approved/pending segments.

    1. Fetches segments for the job
    2. Uses ffmpeg to cut clips from the source video
    3. Saves clip paths to segment records
    """
    # Fetch job
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        return {"passed": False, "message": f"Job {job_id} not found"}

    # Fetch segments
    segments_result = await db.execute(
        select(Segment)
        .where(
            Segment.job_id == job_id,
            Segment.status.in_(["pending", "approved"]),
        )
        .order_by(Segment.start_seconds)
    )
    segments = segments_result.scalars().all()

    if not segments:
        return {"passed": False, "message": "No segments to extract"}

    await upsert_pipeline_step(
        db, job_id, "extract", "running", 10, f"Extracting {len(segments)} clips..."
    )

    # Locate source video
    video_path = settings.upload_path / f"{job_id}.mp4"
    if not video_path.exists():
        video_path = settings.upload_path / job.source_filename
    if not video_path.exists():
        return {"passed": False, "message": f"Source video not found for job {job_id}"}

    clips_dir = settings.output_path / job_id / "clips"
    clips_dir.mkdir(parents=True, exist_ok=True)

    clips_rendered = 0

    try:
        for i, segment in enumerate(segments):
            progress = 10 + int((i / len(segments)) * 80)
            await upsert_pipeline_step(
                db,
                job_id,
                "extract",
                "running",
                progress,
                f"Extracting clip {i + 1}/{len(segments)}...",
            )

            clip_filename = f"clip_{i + 1:03d}.mp4"
            clip_path = clips_dir / clip_filename

            # Calculate duration
            duration = segment.end_seconds - segment.start_seconds
            if duration < 3:
                duration = 3  # Minimum 3 seconds
            if duration > 60:
                duration = 60  # Maximum 60 seconds

            # Extract clip using ffmpeg
            ffmpeg_cmd = [
                "ffmpeg",
                "-ss",
                str(segment.start_seconds),
                "-i",
                str(video_path),
                "-t",
                str(duration),
                "-c:v",
                "libx264",
                "-c:a",
                "aac",
                "-preset",
                "fast",
                "-crf",
                "22",
                "-y",
                str(clip_path),
            ]

            ffmpeg_result = subprocess.run(ffmpeg_cmd, capture_output=True, timeout=120)

            if ffmpeg_result.returncode != 0:
                stderr_tail = ffmpeg_result.stderr.decode(errors="replace")[-500:]
                logger.warning(
                    f"ffmpeg extract failed for segment {segment.id} (job {job_id}): {stderr_tail}"
                )
                continue

            if clip_path.exists() and clip_path.stat().st_size > 0:
                segment.clip_path = str(clip_path)
                clips_rendered += 1
            else:
                logger.warning(
                    f"ffmpeg reported success but produced no/empty output for segment {segment.id} (job {job_id})"
                )

        await upsert_pipeline_step(
            db,
            job_id,
            "extract",
            "complete",
            100,
            f"Extracted {clips_rendered}/{len(segments)} clips",
        )

        return {
            "passed": True,
            "message": f"Extracted {clips_rendered} clips",
            "clips_rendered": clips_rendered,
        }

    except subprocess.TimeoutExpired:
        await upsert_pipeline_step(
            db, job_id, "extract", "failed", 0, "Clip extraction timed out"
        )
        return {"passed": False, "message": "Clip extraction timed out"}
    except Exception as e:
        await upsert_pipeline_step(
            db, job_id, "extract", "failed", 0, f"Extraction failed: {str(e)}"
        )
        return {"passed": False, "message": f"Clip extraction failed: {str(e)}"}
