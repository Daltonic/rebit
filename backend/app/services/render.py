"""
Clip rendering service.

Takes extracted clips and renders them as vertical (9:16) short-form videos
with optional captions/subtitles overlay.
"""

import asyncio
import logging
from pathlib import Path
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import Job, Segment
from app.services.pipeline_steps import upsert_pipeline_step
from app.services.async_subprocess import run_subprocess, SubprocessTimeoutExpired

logger = logging.getLogger(__name__)

# ── Subject detection (for keeping the primary subject centered in the
# vertical crop) ─────────────────────────────────────────────────────────
# Three-tier approach, each tier only used if the one above it comes up
# empty:
#   1. Face detection — OpenCV's bundled Haar cascade. No model download
#      needed; ships in the base opencv-python package.
#   2. Generic saliency detection — OpenCV's saliency module, for content
#      whose "primary object" isn't a person: products, animals, a phone
#      screen, whatever the visually dominant thing in frame is. This
#      lives in opencv-contrib-python (or opencv-contrib-python-headless
#      on a server), NOT the base opencv-python package, so it's treated
#      as independently optional from face detection.
#   3. Plain center crop — the final fallback if neither of the above is
#      available or finds anything.
try:
    import cv2
    import numpy as np

    _CV2_AVAILABLE = True
except Exception as e:
    cv2 = None
    np = None
    _CV2_AVAILABLE = False
    logger.warning(
        f"OpenCV unavailable — vertical clips will use a center crop instead of subject tracking: {e}"
    )

_FACE_CASCADE = None
_SALIENCY = None

if _CV2_AVAILABLE:
    try:
        _FACE_CASCADE = cv2.CascadeClassifier(
            cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        )
        if _FACE_CASCADE.empty():
            _FACE_CASCADE = None
    except Exception as e:
        logger.warning(f"Face cascade unavailable: {e}")

    try:
        _SALIENCY = cv2.saliency.StaticSaliencySpectralResidual_create()
    except Exception as e:
        logger.warning(
            "OpenCV saliency module unavailable (needs opencv-contrib-python or "
            f"opencv-contrib-python-headless) — non-face subjects won't be tracked, "
            f"only faces and a center-crop fallback: {e}"
        )

# How many frames to sample across a clip when looking for the subject.
FACE_SAMPLE_COUNT = 8


def _detect_face_center_x(video_path: Path, height: int) -> Optional[float]:
    """
    Sample a handful of frames from the clip and run face detection to
    find where the primary speaker sits horizontally, so the vertical
    crop can stay centered on them instead of blindly cutting the middle
    of the original landscape frame (which crops people out when they
    aren't centered in the source shot).

    Returns the detected face center as an x-coordinate in source pixel
    space — the largest face per sampled frame is treated as "the
    speaker" and results are weighted by face area across samples so one
    small, incidental face in the background doesn't skew the crop.
    Returns None if OpenCV/the cascade isn't available or no face was
    found in any sampled frame; the caller should try the saliency
    fallback next.

    This is synchronous, CPU-bound OpenCV work — the caller runs it via
    `asyncio.to_thread()` rather than awaiting it directly, so decoding
    and scanning frames doesn't block the event loop.
    """
    if _FACE_CASCADE is None:
        return None

    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        return None

    try:
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        if total_frames <= 0:
            return None

        sample_indices = [
            int(total_frames * (i + 1) / (FACE_SAMPLE_COUNT + 1))
            for i in range(FACE_SAMPLE_COUNT)
        ]

        weighted_sum = 0.0
        weight_total = 0.0

        for idx in sample_indices:
            cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
            ok, frame = cap.read()
            if not ok or frame is None:
                continue

            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            faces = _FACE_CASCADE.detectMultiScale(
                gray,
                scaleFactor=1.1,
                minNeighbors=5,
                minSize=(int(height * 0.08), int(height * 0.08)),
            )
            if len(faces) == 0:
                continue

            # Largest face in this frame = the primary speaker
            fx, fy, fw, fh = max(faces, key=lambda f: f[2] * f[3])
            center_x = fx + fw / 2
            area = fw * fh

            weighted_sum += center_x * area
            weight_total += area

        if weight_total == 0:
            return None

        return weighted_sum / weight_total

    finally:
        cap.release()


def _detect_salient_center_x(video_path: Path, height: int) -> Optional[float]:
    """
    Second-tier fallback for content with no detectable face: finds the
    visually most prominent region of the frame (whatever it is — a
    product, a screen, an animal, anything) using OpenCV's generic
    saliency detection, and returns its horizontal center.

    Unlike face detection this doesn't know or care *what* the subject
    is, only that it stands out from the rest of the frame. Returns None
    if the saliency module isn't available or nothing salient was found
    in any sampled frame; the caller should fall back to a plain center
    crop at that point.

    Same as _detect_face_center_x: synchronous OpenCV work, meant to be
    run via `asyncio.to_thread()`, not awaited directly.
    """
    if _SALIENCY is None:
        return None

    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        return None

    try:
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        if total_frames <= 0:
            return None

        sample_indices = [
            int(total_frames * (i + 1) / (FACE_SAMPLE_COUNT + 1))
            for i in range(FACE_SAMPLE_COUNT)
        ]

        weighted_sum = 0.0
        weight_total = 0.0

        for idx in sample_indices:
            cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
            ok, frame = cap.read()
            if not ok or frame is None:
                continue

            success, saliency_map = _SALIENCY.computeSaliency(frame)
            if not success:
                continue

            saliency_map = (saliency_map * 255).astype("uint8")
            # Otsu threshold isolates the most salient region from the
            # rest of the frame rather than averaging over everything,
            # which would just pull the result back toward center.
            _, thresh = cv2.threshold(
                saliency_map, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU
            )
            ys, xs = np.nonzero(thresh)
            if len(xs) == 0:
                continue

            frame_weight = float(len(xs))
            frame_center_x = float(xs.mean())

            weighted_sum += frame_center_x * frame_weight
            weight_total += frame_weight

        if weight_total == 0:
            return None

        return weighted_sum / weight_total

    finally:
        cap.release()


async def render_clips(
    job_id: str,
    db: AsyncSession,
) -> dict:
    """
    Render extracted clips as vertical short-form videos.

    1. Fetches segments with clip_path set
    2. Converts each to 9:16 vertical format
    3. Adds optional caption overlay

    All ffprobe/ffmpeg calls run through async_subprocess.run_subprocess()
    instead of subprocess.run(), and the OpenCV subject-detection calls
    run through asyncio.to_thread() instead of being called directly —
    both were blocking the event loop for as long as this stage ran,
    which is what froze the job page's polling and SSE updates during
    rendering.
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

    await upsert_pipeline_step(
        db, job_id, "render", "running", 10, f"Rendering {len(segments)} clips..."
    )

    rendered_dir = settings.output_path / job_id / "rendered"
    rendered_dir.mkdir(parents=True, exist_ok=True)

    clips_rendered = 0

    try:
        for i, segment in enumerate(segments):
            progress = 10 + int((i / len(segments)) * 80)
            await upsert_pipeline_step(
                db,
                job_id,
                "render",
                "running",
                progress,
                f"Rendering clip {i + 1}/{len(segments)}...",
            )

            source_path = Path(segment.clip_path)
            if not source_path.exists():
                continue

            output_filename = f"rendered_{i + 1:03d}.mp4"
            output_path = rendered_dir / output_filename

            # Get source video dimensions
            probe_cmd = [
                "ffprobe",
                "-v",
                "error",
                "-select_streams",
                "v:0",
                "-show_entries",
                "stream=width,height",
                "-of",
                "csv=p=0",
                str(source_path),
            ]
            probe_result = await run_subprocess(probe_cmd, timeout=30)
            dimensions = probe_result.stdout.decode(errors="replace").strip().split(",")

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
                    "-i",
                    str(source_path),
                    "-c:v",
                    "libx264",
                    "-c:a",
                    "aac",
                    "-preset",
                    "fast",
                    "-crf",
                    "22",
                    "-y",
                    str(output_path),
                ]
            else:
                # Crop the source down to a 9:16 slice centered on the
                # detected speaker's face, then scale to the standard
                # 1080x1920 output. This keeps the person correctly
                # framed, instead of shrinking the whole landscape frame
                # into a letterboxed vertical canvas — which is
                # technically "vertical" but doesn't follow the subject,
                # which is the actual point of this feature.
                crop_width_px = int(height * 9 / 16)
                crop_width_px -= crop_width_px % 2  # even width for libx264/yuv420p

                if crop_width_px >= width:
                    # Source is wider than 16:9 (e.g. ultra-wide) — a
                    # meaningful horizontal crop isn't possible without
                    # cutting into the subject either way, so fall back
                    # to letterboxing the full frame instead.
                    ffmpeg_cmd = [
                        "ffmpeg",
                        "-i",
                        str(source_path),
                        "-vf",
                        "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2",
                        "-c:v",
                        "libx264",
                        "-c:a",
                        "aac",
                        "-preset",
                        "fast",
                        "-crf",
                        "22",
                        "-y",
                        str(output_path),
                    ]
                else:
                    focus_center_x = await asyncio.to_thread(
                        _detect_face_center_x, source_path, height
                    )
                    focus_method = "face"

                    if focus_center_x is None:
                        focus_center_x = await asyncio.to_thread(
                            _detect_salient_center_x, source_path, height
                        )
                        focus_method = "saliency"

                    if focus_center_x is None:
                        focus_center_x = width / 2  # final fallback: plain center crop
                        focus_method = "center"

                    logger.info(
                        f"Using {focus_method} crop focus for segment {segment.id} (job {job_id})"
                    )

                    crop_x = int(focus_center_x - crop_width_px / 2)
                    crop_x = max(0, min(crop_x, width - crop_width_px))
                    crop_x -= crop_x % 2

                    ffmpeg_cmd = [
                        "ffmpeg",
                        "-i",
                        str(source_path),
                        "-vf",
                        f"crop={crop_width_px}:{height}:{crop_x}:0,scale=1080:1920",
                        "-c:v",
                        "libx264",
                        "-c:a",
                        "aac",
                        "-preset",
                        "fast",
                        "-crf",
                        "22",
                        "-y",
                        str(output_path),
                    ]

            clip_label = f"clip {i + 1}/{len(segments)}"
            ticks = {"count": 0}

            async def _tick(progress=progress, clip_label=clip_label):
                ticks["count"] += 1
                await upsert_pipeline_step(
                    db,
                    job_id,
                    "render",
                    "running",
                    progress,
                    f"Rendering {clip_label}... (still processing, {ticks['count'] * 15}s elapsed)",
                )

            ffmpeg_result = await run_subprocess(
                ffmpeg_cmd, timeout=180, progress_callback=_tick, progress_interval=15.0
            )

            if ffmpeg_result.returncode != 0:
                stderr_tail = ffmpeg_result.stderr.decode(errors="replace")[-500:]
                logger.warning(
                    f"ffmpeg render failed for segment {segment.id} (job {job_id}): {stderr_tail}"
                )
                # Leave segment.clip_path pointing at the still-valid
                # extracted (unrendered) clip rather than overwriting it
                # with a broken/empty file, so playback still works.
                continue

            if output_path.exists() and output_path.stat().st_size > 0:
                segment.clip_path = str(output_path)
                clips_rendered += 1
            else:
                logger.warning(
                    f"ffmpeg reported success but produced no/empty output for segment {segment.id} (job {job_id})"
                )

        await upsert_pipeline_step(
            db,
            job_id,
            "render",
            "complete",
            100,
            f"Rendered {clips_rendered}/{len(segments)} clips",
        )

        return {
            "passed": True,
            "message": f"Rendered {clips_rendered} clips",
            "clips_rendered": clips_rendered,
        }

    except SubprocessTimeoutExpired:
        await upsert_pipeline_step(
            db, job_id, "render", "failed", 0, "Rendering timed out"
        )
        return {"passed": False, "message": "Rendering timed out"}
    except Exception as e:
        await upsert_pipeline_step(
            db, job_id, "render", "failed", 0, f"Rendering failed: {str(e)}"
        )
        return {"passed": False, "message": f"Rendering failed: {str(e)}"}
