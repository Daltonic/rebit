"""
Clip rendering service.

Takes extracted clips and renders them as vertical (9:16) short-form videos
with optional captions/subtitles overlay.
"""

import subprocess
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import Job, Segment, PipelineStep


async def render_clips(
    job_id: str,
    db: AsyncSession,
) -> dict:
    """
    Render extracted clips as vertical short-form videos.
    
    1. Fetches segments with clip_path set
    2. Converts each to 9:16 vertical format
    3. Adds optional caption overlay
    """
    # Fetch job
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        return {"passed": False, "message": f"Job {job_id} not found"}

    # Fetch segments with clip paths
    segments_result = await db.execute(
        select(Segment).where(
            Segment.job_id == job_id,
            Segment.clip_path.isnot(None),
        )
    )
    segments = segments_result.scalars().all()

    if not segments:
        return {"passed": False, "message": "No clips to render"}

    await _update_step(db, job_id, "render", "running", 10, f"Rendering {len(segments)} clips...")

    rendered_dir = settings.output_path / job_id / "rendered"
    rendered_dir.mkdir(parents=True, exist_ok=True)

    clips_rendered = 0

    try:
        for i, segment in enumerate(segments):
            progress = 10 + int((i / len(segments)) * 80)
            await _update_step(
                db, job_id, "render", "running", progress,
                f"Rendering clip {i + 1}/{len(segments)}..."
            )

            source_path = Path(segment.clip_path)
            if not source_path.exists():
                continue

            output_filename = f"rendered_{i + 1:03d}.mp4"
            output_path = rendered_dir / output_filename

            # Get source video dimensions
            probe_cmd = [
                "ffprobe", "-v", "error",
                "-select_streams", "v:0",
                "-show_entries", "stream=width,height",
                "-of", "csv=p=0",
                str(source_path),
            ]
            probe_result = subprocess.run(probe_cmd, capture_output=True, text=True, timeout=30)
            dimensions = probe_result.stdout.strip().split(",")

            if len(dimensions) == 2:
                width, height = int(dimensions[0]), int(dimensions[1])
            else:
                width, height = 1920, 1080

            # Determine if source is already vertical
            is_vertical = height > width

            if is_vertical:
                # Already vertical — just copy
                ffmpeg_cmd = [
                    "ffmpeg",
                    "-i", str(source_path),
                    "-c:v", "libx264",
                    "-c:a", "aac",
                    "-preset", "fast",
                    "-crf", "22",
                    "-y",
                    str(output_path),
                ]
            else:
                # Convert to vertical (9:16) — crop center
                target_height = int(width * 16 / 9)
                if target_height > height:
                    # Letterbox instead of crop
                    target_width = int(height * 9 / 16)
                    ffmpeg_cmd = [
                        "ffmpeg",
                        "-i", str(source_path),
                        "-vf", f"scale={target_width}:{height},pad={target_width}:{int(target_width*16/9)}:(ow-iw)/2:(oh-ih)/2",
                        "-c:v", "libx264",
                        "-c:a", "aac",
                        "-preset", "fast",
                        "-crf", "22",
                        "-y",
                        str(output_path),
                    ]
                else:
                    # Crop to vertical
                    crop_height = int(width * 16 / 9)
                    crop_y = int((height - crop_height) / 2)
                    ffmpeg_cmd = [
                        "ffmpeg",
                        "-i", str(source_path),
                        "-vf", f"crop={width}:{crop_height}:0:{crop_y},scale=1080:1920",
                        "-c:v", "libx264",
                        "-c:a", "aac",
                        "-preset", "fast",
                        "-crf", "22",
                        "-y",
                        str(output_path),
                    ]

            subprocess.run(ffmpeg_cmd, capture_output=True, timeout=180)

            if output_path.exists():
                segment.clip_path = str(output_path)
                clips_rendered += 1

        await _update_step(
            db, job_id, "render", "complete", 100,
            f"Rendered {clips_rendered}/{len(segments)} clips"
        )

        # Update job status
        job.status = "rendering"

        return {
            "passed": True,
            "message": f"Rendered {clips_rendered} clips",
            "clips_rendered": clips_rendered,
        }

    except subprocess.TimeoutExpired:
        await _update_step(db, job_id, "render", "failed", 0, "Rendering timed out")
        return {"passed": False, "message": "Rendering timed out"}
    except Exception as e:
        await _update_step(db, job_id, "render", "failed", 0, f"Rendering failed: {str(e)}")
        return {"passed": False, "message": f"Rendering failed: {str(e)}"}


async def _update_step(
    db: AsyncSession,
    job_id: str,
    stage: str,
    status: str,
    progress_pct: int,
    message: str,
):
    """Create or update a pipeline step record."""
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(PipelineStep).where(
            PipelineStep.job_id == job_id,
            PipelineStep.stage == stage,
        )
    )
    step = result.scalar_one_or_none()

    if step:
        step.status = status
        step.progress_pct = progress_pct
        step.message = message
        if status == "running" and not step.started_at:
            step.started_at = now
        if status in ("complete", "failed"):
            step.completed_at = now
    else:
        db.add(PipelineStep(
            job_id=job_id,
            stage=stage,
            status=status,
            progress_pct=progress_pct,
            message=message,
            started_at=now if status == "running" else None,
        ))