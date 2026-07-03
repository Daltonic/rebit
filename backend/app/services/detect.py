"""
Highlight detection service.

Analyzes the transcript to find the most engaging moments (segments)
using heuristics and optionally LLM analysis via OpenRouter.
Creates Segment records in the database.
"""

import json
import re
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.config import settings
from backend.app.models import Job, Segment, Transcript, PipelineStep


# ── Configuration ────────────────────────────────────────────────────────

HOOK_KEYWORDS = {
    "strong": [
        "welcome", "introducing", "announcing", "breaking", "exclusive",
        "urgent", "important", "must see", "game changer", "revolutionary",
        "shocking", "incredible", "amazing", "unbelievable", "huge",
    ],
    "moderate": [
        "how to", "guide", "tips", "tutorial", "learn", "step",
        "secret", "revealed", "proof", "reason", "why", "best",
        "top", "essential", "critical", "key",
    ],
    "weak": [
        "and", "the", "but", "so", "like", "actually", "basically",
        "um", "uh", "well", "okay", "so", "right",
    ],
}

EMOTIONAL_SIGNALS = {
    "excitement": ["!", "amazing", "incredible", "wow", "awesome", "fantastic"],
    "surprise": ["shocking", "unexpected", "surprising", "never", "whoa"],
    "urgency": ["now", "hurry", "limited", "last chance", "breaking"],
    "curiosity": ["secret", "hidden", "revealed", "truth", "real reason"],
    "authority": ["expert", "study shows", "research", "data shows", "statistics"],
    "positivity": ["love", "great", "wonderful", "beautiful", "perfect"],
}


async def detect_highlights(
    job_id: str,
    db: AsyncSession,
) -> dict:
    """
    Detect highlight segments from a job's transcript.
    
    1. Fetches the transcript
    2. Analyzes each segment for hook strength, virality, emotional signals
    3. Creates Segment records in DB
    """
    # Fetch job & transcript
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        return {"passed": False, "message": f"Job {job_id} not found"}

    transcript_result = await db.execute(
        select(Transcript).where(Transcript.job_id == job_id)
    )
    transcript = transcript_result.scalar_one_or_none()
    if not transcript:
        return {"passed": False, "message": f"Transcript not found for job {job_id}"}

    await _update_step(db, job_id, "detect", "running", 10, "Starting highlight detection...")

    try:
        # Parse transcript segments from JSON
        json_data = transcript.json_content
        if isinstance(json_data, str):
            json_data = json.loads(json_data)

        raw_segments = json_data.get("segments", [])
        if not raw_segments:
            # Try parsing from VTT
            raw_segments = _parse_vtt_segments(transcript.vtt_content)

        if not raw_segments:
            return {"passed": False, "message": "No segments found in transcript"}

        await _update_step(db, job_id, "detect", "running", 40, f"Analyzing {len(raw_segments)} segments...")

        # Analyze each segment
        analyzed_segments = []
        for seg in raw_segments:
            text = seg.get("text", "").strip()
            if not text:
                continue

            start = seg.get("start", 0)
            end = seg.get("end", start + 5)

            hook_strength = _analyze_hook_strength(text)
            virality_score = _calculate_virality(text, start, end)
            emotional_signal = _detect_emotional_signal(text)

            analyzed_segments.append({
                "start_seconds": start,
                "end_seconds": end,
                "hook_strength": hook_strength,
                "virality_score": virality_score,
                "emotional_signal": emotional_signal,
                "transcript_excerpt": text,
            })

        await _update_step(db, job_id, "detect", "running", 70, f"Filtering top segments...")

        # Sort by virality and keep top segments
        analyzed_segments.sort(key=lambda s: s["virality_score"], reverse=True)
        top_segments = analyzed_segments[:20]  # Keep top 20

        # Delete existing segments for this job
        await db.execute(delete(Segment).where(Segment.job_id == job_id))

        # Create new segments
        for seg_data in top_segments:
            db.add(Segment(
                job_id=job_id,
                start_seconds=seg_data["start_seconds"],
                end_seconds=seg_data["end_seconds"],
                hook_strength=seg_data["hook_strength"],
                virality_score=seg_data["virality_score"],
                emotional_signal=seg_data["emotional_signal"],
                transcript_excerpt=seg_data["transcript_excerpt"],
                status="pending",
            ))

        await db.flush()

        await _update_step(
            db, job_id, "detect", "complete", 100,
            f"Detected {len(top_segments)} highlight segments"
        )

        # Update job status
        job.status = "detecting"

        return {
            "passed": True,
            "message": f"Detected {len(top_segments)} highlight segments",
            "segments_count": len(top_segments),
        }

    except Exception as e:
        await _update_step(db, job_id, "detect", "failed", 0, f"Detection failed: {str(e)}")
        return {"passed": False, "message": f"Highlight detection failed: {str(e)}"}


def _analyze_hook_strength(text: str) -> str:
    """Analyze how strong the hook is for a segment."""
    text_lower = text.lower()

    # Check for strong hooks
    for keyword in HOOK_KEYWORDS["strong"]:
        if keyword in text_lower:
            return "Strong"

    # Check for moderate hooks
    for keyword in HOOK_KEYWORDS["moderate"]:
        if keyword in text_lower:
            return "Moderate"

    return "Weak"


def _calculate_virality(text: str, start: float, end: float) -> int:
    """
    Calculate a virality score (0-100) based on:
    - Hook strength
    - Emotional signals
    - Position in video (earlier = more viral)
    - Length (shorter = more viral for clips)
    """
    score = 30  # Base score
    text_lower = text.lower()
    duration = end - start

    # Hook strength bonus
    for keyword in HOOK_KEYWORDS["strong"]:
        if keyword in text_lower:
            score += 15
            break
    else:
        for keyword in HOOK_KEYWORDS["moderate"]:
            if keyword in text_lower:
                score += 8
                break

    # Emotional signals bonus
    for signal_type, keywords in EMOTIONAL_SIGNALS.items():
        for keyword in keywords:
            if keyword in text_lower:
                score += 10
                break

    # Position bonus (earlier in video is better)
    if start < 30:
        score += 15
    elif start < 60:
        score += 10
    elif start < 120:
        score += 5

    # Duration penalty (longer clips are less viral)
    if duration < 10:
        score += 10
    elif duration < 20:
        score += 5
    elif duration > 45:
        score -= 10

    # Exclamation bonus
    if "!" in text:
        score += 5

    # Question bonus
    if "?" in text:
        score += 8

    return max(0, min(100, score))


def _detect_emotional_signal(text: str) -> str:
    """Detect the primary emotional signal in text."""
    text_lower = text.lower()
    signal_scores = {}

    for signal_type, keywords in EMOTIONAL_SIGNALS.items():
        score = 0
        for keyword in keywords:
            if keyword in text_lower:
                score += 1
        if score > 0:
            signal_scores[signal_type] = score

    if not signal_scores:
        return "neutral"

    # Return the signal with highest score
    return max(signal_scores, key=signal_scores.get)


def _parse_vtt_segments(vtt_content: str) -> list[dict]:
    """Parse VTT content into segment dictionaries."""
    segments = []
    lines = vtt_content.strip().split("\n")

    i = 0
    while i < len(lines):
        line = lines[i].strip()

        # Look for timestamp lines
        if "-->" in line:
            # Parse timestamps
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
                    segments.append({
                        "start": start,
                        "end": end,
                        "text": text,
                    })
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