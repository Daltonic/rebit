"""
Cleanup service for removing local job files after they've been stored on Sia.

Architecture:
  - Files are stored on the Sia Network (decentralized storage) as the
    permanent home for all job artifacts.
  - Local copies on the server filesystem are TEMPORARY — they exist only
    for pipeline processing (ffmpeg extraction, rendering) and for serving
    clips via the video player before the Sia cache is populated.
  - Once the pipeline's ``sia_store`` stage confirms all artifacts are on
    Sia, local files should be removed to prevent the server from filling
    up with data that has a permanent home elsewhere.

Directories cleaned:
  - ``{upload_dir}/{job_id}.mp4`` — source video uploaded by the user
  - ``{output_dir}/{job_id}/`` — entire output tree (clips, rendered,
    subtitles, etc.)

This module is called from two places:
  1. ``sia.py`` — after a successful ``store_job_artifacts()`` run
  2. ``routers/jobs.py`` — when a user deletes a job via the API
"""

import logging
import shutil
from pathlib import Path

from app.config import settings

logger = logging.getLogger(__name__)


def cleanup_job_files(job_id: str) -> dict:
    """
    Remove all local filesystem artifacts for a given job.

    This is a synchronous, best-effort operation — it logs warnings on
    failure but never raises, so the caller (an API handler or pipeline
    stage) can continue without interruption.

    Returns a dict with:
      - ``upload_deleted``: bool — whether the source upload was removed
      - ``output_deleted``: bool — whether the output directory was removed
      - ``errors``: list[str] — any non-fatal error messages
    """
    errors: list[str] = []
    upload_deleted = False
    output_deleted = False

    # 1. Source video file
    upload_path = settings.upload_path / f"{job_id}.mp4"
    if upload_path.exists():
        try:
            upload_path.unlink()
            upload_deleted = True
            logger.info(f"Deleted source video: {upload_path}")
        except OSError as e:
            msg = f"Failed to delete source video {upload_path}: {e}"
            logger.warning(msg)
            errors.append(msg)
    else:
        logger.debug(f"Source video not found (already cleaned): {upload_path}")

    # 2. Output directory (clips, rendered, subtitles, etc.)
    output_dir = settings.output_path / job_id
    if output_dir.exists():
        try:
            shutil.rmtree(output_dir)
            output_deleted = True
            logger.info(f"Deleted output directory: {output_dir}")
        except OSError as e:
            msg = f"Failed to delete output directory {output_dir}: {e}"
            logger.warning(msg)
            errors.append(msg)
    else:
        logger.debug(f"Output directory not found (already cleaned): {output_dir}")

    return {
        "upload_deleted": upload_deleted,
        "output_deleted": output_deleted,
        "errors": errors,
    }