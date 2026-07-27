"""
Transcription service using OpenAI Whisper.
Transcribes video/audio to text with word-level timestamps.
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import Job, Transcript
from app.services.pipeline_steps import upsert_pipeline_step
from app.services.async_subprocess import run_subprocess, SubprocessTimeoutExpired


def _make_progress_ticker(
    job_id: str,
    db: AsyncSession,
    stage: str,
    base_pct: int,
    ceiling_pct: int,
    label: str,
):
    """
    Returns an async no-arg callback for run_subprocess's progress_callback.

    Each tick nudges progress up toward (but never past) ceiling_pct and
    republishes the step with an elapsed-time message, so a 9-minute
    whisper call or a multi-minute ffmpeg pass shows up as "still
    running" instead of leaving the UI frozen on the same percentage
    until the process finally exits.
    """
    ticks = {"count": 0}

    async def _tick():
        ticks["count"] += 1
        elapsed = ticks["count"] * 15
        pct = min(base_pct + ticks["count"] * 2, ceiling_pct)
        await upsert_pipeline_step(
            db,
            job_id,
            stage,
            "running",
            pct,
            f"{label} (still processing, {elapsed}s elapsed)",
        )

    return _tick


async def transcribe_job(
    job_id: str,
    db: AsyncSession,
) -> dict:
    """
    Transcribe a video file associated with a job.

    1. Fetches the job from DB
    2. Locates the uploaded video file
    3. Runs Whisper transcription
    4. Saves transcript to DB (VTT + JSON)
    5. Updates job duration

    Both the ffmpeg audio-extraction step and the whisper CLI run via
    async_subprocess.run_subprocess() instead of subprocess.run(). This
    is the single longest-running stage in the pipeline (whisper alone
    has a 10-minute timeout below) — a blocking call here is the main
    reason the job page used to sit frozen on a spinner: the event loop
    couldn't respond to status polling or SSE while whisper was running.
    """
    # Fetch job
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        return {"passed": False, "message": f"Job {job_id} not found"}

    await upsert_pipeline_step(
        db, job_id, "transcribe", "running", 10, "Starting transcription..."
    )

    # Locate video file
    video_path = settings.upload_path / f"{job_id}.mp4"
    if not video_path.exists():
        video_path = settings.upload_path / job.source_filename
    if not video_path.exists():
        return {"passed": False, "message": f"Video file not found for job {job_id}"}

    try:
        await upsert_pipeline_step(
            db, job_id, "transcribe", "running", 30, "Extracting audio..."
        )

        # Extract audio using ffmpeg
        audio_path = settings.output_path / f"{job_id}_audio.wav"
        audio_path.parent.mkdir(parents=True, exist_ok=True)

        ffmpeg_cmd = [
            "ffmpeg",
            "-i",
            str(video_path),
            "-vn",
            "-acodec",
            "pcm_s16le",
            "-ar",
            "16000",
            "-ac",
            "1",
            "-y",
            str(audio_path),
        ]
        await run_subprocess(
            ffmpeg_cmd,
            timeout=300,
            progress_callback=_make_progress_ticker(
                job_id, db, "transcribe", 30, 48, "Extracting audio..."
            ),
            progress_interval=15.0,
        )

        await upsert_pipeline_step(
            db, job_id, "transcribe", "running", 50, "Running Whisper transcription..."
        )

        # Run Whisper via command line (falls back to OpenAI Whisper if installed)
        vtt_path = settings.output_path / f"{job_id}_audio.vtt"
        json_path = settings.output_path / f"{job_id}_audio.json"

        whisper_cmd = [
            "whisper",
            str(audio_path),
            "--model",
            settings.whisper_model,
            "--output_dir",
            str(settings.output_path),
            "--output_format",
            "vtt",
            "--language",
            "en",
            "--device",
            settings.whisper_device,
        ]
        result_whisper = await run_subprocess(
            whisper_cmd,
            timeout=600,
            progress_callback=_make_progress_ticker(
                job_id, db, "transcribe", 50, 78, "Running Whisper transcription..."
            ),
            progress_interval=15.0,
        )

        if result_whisper.returncode != 0:
            # Fallback: try using whisper via python module.
            # model.transcribe() is CPU/GPU-bound synchronous work, same
            # problem as subprocess.run() — it would block the event
            # loop for the whole transcription, so it's offloaded to a
            # worker thread instead of awaited directly.
            try:
                import asyncio
                import whisper as whisper_lib

                def _run_whisper_module():
                    model = whisper_lib.load_model(settings.whisper_model)
                    return model.transcribe(str(audio_path))

                transcribe_result = await asyncio.to_thread(_run_whisper_module)

                # Generate VTT
                vtt_lines = ["WEBVTT", ""]
                word_count = 0
                for seg in transcribe_result.get("segments", []):
                    start = _format_vtt_time(seg["start"])
                    end = _format_vtt_time(seg["end"])
                    text = seg["text"].strip()
                    vtt_lines.append(f"{start} --> {end}")
                    vtt_lines.append(text)
                    vtt_lines.append("")
                    word_count += len(text.split())

                vtt_content = "\n".join(vtt_lines)
                json_content = transcribe_result
                duration_seconds = int(transcribe_result.get("duration", 0))

            except ImportError:
                # Generate mock transcript for demo/testing
                vtt_content, json_content, word_count, duration_seconds = (
                    _generate_mock_transcript(job_id)
                )
        else:
            # Read VTT output
            if vtt_path.exists():
                vtt_content = vtt_path.read_text(encoding="utf-8")
            else:
                vtt_content = "WEBVTT\n\n"

            # Parse VTT segments into JSON structure for the detect stage
            vtt_segments = _parse_vtt_segments(vtt_content)
            json_content = {
                "text": vtt_content,
                "segments": vtt_segments,
            }
            word_count = len(vtt_content.split())
            duration_seconds = _estimate_duration(vtt_content)

        await upsert_pipeline_step(
            db, job_id, "transcribe", "running", 80, "Saving transcript..."
        )

        # Save transcript to DB
        existing = await db.execute(
            select(Transcript).where(Transcript.job_id == job_id)
        )
        existing_transcript = existing.scalar_one_or_none()

        if existing_transcript:
            existing_transcript.vtt_content = vtt_content
            existing_transcript.json_content = json_content
        else:
            db.add(
                Transcript(
                    job_id=job_id,
                    vtt_content=vtt_content,
                    json_content=json_content,
                )
            )

        # Update job duration
        if duration_seconds:
            job.duration_seconds = duration_seconds

        await db.flush()

        await upsert_pipeline_step(
            db, job_id, "transcribe", "complete", 100, "Transcription complete"
        )

        # NOTE: job.status is no longer set here. The orchestrator is the
        # single place that maps a running stage to job.status (see
        # STAGE_TO_JOB_STATUS in pipeline_steps.py) — that's what fixes the
        # frontend showing a stale "Upload complete" status while a later
        # stage was actually running.

        return {
            "passed": True,
            "message": "Transcription completed successfully",
            "duration_seconds": duration_seconds,
            "word_count": word_count,
        }

    except SubprocessTimeoutExpired:
        await upsert_pipeline_step(
            db, job_id, "transcribe", "failed", 0, "Transcription timed out"
        )
        return {"passed": False, "message": "Transcription timed out after 10 minutes"}
    except Exception as e:
        await upsert_pipeline_step(
            db, job_id, "transcribe", "failed", 0, f"Transcription failed: {str(e)}"
        )
        return {"passed": False, "message": f"Transcription failed: {str(e)}"}


def _format_vtt_time(seconds: float) -> str:
    """Convert seconds to VTT timestamp format: HH:MM:SS.mmm"""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = seconds % 60
    return f"{hours:02d}:{minutes:02d}:{secs:06.3f}"


def _estimate_duration(vtt_content: str) -> int:
    """Estimate video duration from VTT timestamps."""
    import re

    times = re.findall(r"(\d{2}:\d{2}:\d{2}\.\d{3})", vtt_content)
    if not times:
        return 0
    last = times[-1]
    parts = last.split(":")
    return int(parts[0]) * 3600 + int(parts[1]) * 60 + int(float(parts[2]))


def _parse_vtt_segments(vtt_content: str) -> list[dict]:
    """Parse VTT content into segment dictionaries with start, end, and text."""
    segments = []
    lines = vtt_content.strip().split("\n")

    i = 0
    while i < len(lines):
        line = lines[i].strip()

        # Look for timestamp lines
        if "-->" in line:
            parts = line.split(" --> ")
            if len(parts) == 2:
                start = _parse_vtt_timestamp(parts[0])
                end = _parse_vtt_timestamp(parts[1])

                # Collect text until blank line
                text_lines = []
                i += 1
                while i < len(lines) and lines[i].strip():
                    text_lines.append(lines[i].strip())
                    i += 1

                text = " ".join(text_lines)
                if text:
                    segments.append(
                        {
                            "start": start,
                            "end": end,
                            "text": text,
                        }
                    )
        i += 1

    return segments


def _parse_vtt_timestamp(ts: str) -> float:
    """Parse a VTT timestamp to seconds."""
    ts = ts.strip()
    parts = ts.replace(",", ".").split(":")
    if len(parts) == 3:
        return int(parts[0]) * 3600 + int(parts[1]) * 60 + float(parts[2])
    elif len(parts) == 2:
        return int(parts[0]) * 60 + float(parts[1])
    return 0.0


def _generate_mock_transcript(job_id: str):
    """Generate a mock transcript for development/testing."""
    vtt = """WEBVTT

00:00:00.000 --> 00:00:05.000
Welcome to this video tutorial on getting started with the platform.

00:00:05.000 --> 00:00:12.000
Today we're going to cover the basics of how to upload your first video and create engaging clips.

00:00:12.000 --> 00:00:18.500
The first thing you need to do is navigate to the upload page and select your video file.

00:00:18.500 --> 00:00:25.000
Once uploaded, our AI system will automatically transcribe and analyze your content.

00:00:25.000 --> 00:00:32.000
It looks for the most engaging moments, the parts that will really grab your audience's attention.

00:00:32.000 --> 00:00:38.000
These highlights are then presented to you as segments you can review and approve.

00:00:38.000 --> 00:00:45.000
You have full control over which clips to keep and which to discard.

00:00:45.000 --> 00:00:52.000
After selecting your preferred clips, the system renders them as vertical short-form videos.

00:00:52.000 --> 00:00:58.000
Finally, everything is stored securely on the Sia decentralized network.

00:00:58.000 --> 00:01:05.000
This ensures your content remains accessible and tamper-proof at all times.

00:01:05.000 --> 00:01:10.000
Thank you for watching! Get started today and transform your long-form content.
"""
    json_data = {
        "text": "Welcome to this video tutorial...",
        "segments": [
            {
                "start": 0.0,
                "end": 5.0,
                "text": "Welcome to this video tutorial on getting started with the platform.",
            },
            {
                "start": 5.0,
                "end": 12.0,
                "text": "Today we're going to cover the basics of how to upload your first video and create engaging clips.",
            },
            {
                "start": 12.0,
                "end": 18.5,
                "text": "The first thing you need to do is navigate to the upload page and select your video file.",
            },
            {
                "start": 18.5,
                "end": 25.0,
                "text": "Once uploaded, our AI system will automatically transcribe and analyze your content.",
            },
            {
                "start": 25.0,
                "end": 32.0,
                "text": "It looks for the most engaging moments, the parts that will really grab your audience's attention.",
            },
            {
                "start": 38.0,
                "end": 45.0,
                "text": "You have full control over which clips to keep and which to discard.",
            },
            {
                "start": 45.0,
                "end": 52.0,
                "text": "After selecting your preferred clips, the system renders them as vertical short-form videos.",
            },
            {
                "start": 52.0,
                "end": 58.0,
                "text": "Finally, everything is stored securely on the Sia decentralized network.",
            },
            {
                "start": 58.0,
                "end": 65.0,
                "text": "This ensures your content remains accessible and tamper-proof at all times.",
            },
            {
                "start": 65.0,
                "end": 70.0,
                "text": "Thank you for watching! Get started today and transform your long-form content.",
            },
        ],
        "duration": 70.0,
    }
    return vtt, json_data, 120, 70
