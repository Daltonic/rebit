"""
Highlight detection service.

Analyzes the transcript to find the most engaging moments (segments)
using a multi-strategy approach:
  1. Heuristic analysis (keyword, position, emotional signals) — fast, always runs
  2. Optional LLM analysis via OpenRouter — higher quality, configurable
  3. Fallback to pure heuristic if LLM fails/times out

Features:
  - Granular per-segment progress reporting
  - Timeout protection (configurable per-stage)
  - Nearby segment merging
  - User-configurable sensitivity
  - Creates Segment records in the database.
"""

import asyncio
import json
import logging
import re
import time
from datetime import datetime, timezone

from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import Job, Segment, Transcript, PipelineStep
from app.services.pipeline_steps import upsert_pipeline_step

logger = logging.getLogger(__name__)

# ── Configuration ────────────────────────────────────────────────────────

# Timeout for the entire detect stage (seconds)
DETECT_TIMEOUT_SECONDS = 300  # 5 minutes max

# Timeout for LLM analysis per chunk (seconds)
LLM_TIMEOUT_PER_CHUNK = 30

# Max segments to keep
MAX_SEGMENTS = 20

# Minimum segment duration in seconds
MIN_SEGMENT_DURATION = 2.0

# Maximum segment duration in seconds
MAX_SEGMENT_DURATION = 60.0

# Merge nearby segments if gap is less than this (seconds)
MERGE_GAP_THRESHOLD = 3.0

HOOK_KEYWORDS = {
    "strong": [
        "welcome", "introducing", "announcing", "breaking", "exclusive",
        "urgent", "important", "must see", "game changer", "revolutionary",
        "shocking", "incredible", "amazing", "unbelievable", "huge",
        "critical", "essential", "never before", "first time", "finally",
    ],
    "moderate": [
        "how to", "guide", "tips", "tutorial", "learn", "step",
        "secret", "revealed", "proof", "reason", "why", "best",
        "top", "key", "powerful", "simple", "effective",
    ],
    "weak": [
        "and", "the", "but", "so", "like", "actually", "basically",
        "um", "uh", "well", "okay", "so", "right", "yeah", "just",
    ],
}

EMOTIONAL_SIGNALS = {
    "excitement": ["!", "amazing", "incredible", "wow", "awesome", "fantastic", "love"],
    "surprise": ["shocking", "unexpected", "surprising", "never", "whoa", "no way"],
    "urgency": ["now", "hurry", "limited", "last chance", "breaking", "immediately"],
    "curiosity": ["secret", "hidden", "revealed", "truth", "real reason", "why"],
    "authority": ["expert", "study shows", "research", "data shows", "statistics", "according to"],
    "positivity": ["great", "wonderful", "beautiful", "perfect", "excellent", "brilliant"],
    "negativity": ["terrible", "awful", "worst", "horrible", "disaster", "failure"],
    "contrast": ["but", "however", "although", "on the other hand", "instead"],
}

# Sensitivity presets: (hook_strength_weight, virality_threshold, min_score)
SENSITIVITY_PRESETS = {
    "high": {"hook_weight": 1.0, "virality_threshold": 20, "min_score": 30},
    "medium": {"hook_weight": 1.0, "virality_threshold": 35, "min_score": 45},
    "low": {"hook_weight": 1.0, "virality_threshold": 50, "min_score": 60},
}


async def detect_highlights(
    job_id: str,
    db: AsyncSession,
) -> dict:
    """
    Detect highlight segments from a job's transcript.

    1. Fetches the transcript
    2. Analyzes each segment for hook strength, virality, emotional signals
    3. Optionally runs LLM analysis for higher quality
    4. Merges nearby segments
    5. Creates Segment records in DB

    Uses asyncio.wait_for to prevent indefinite hangs.
    """
    start_time = time.monotonic()

    try:
        return await asyncio.wait_for(
            _detect_highlights_impl(job_id, db, start_time),
            timeout=DETECT_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError:
        logger.error(f"Highlight detection timed out for job {job_id} after {DETECT_TIMEOUT_SECONDS}s")
        await upsert_pipeline_step(db, job_id, "detect", "failed", 0,
                                f"Detection timed out after {DETECT_TIMEOUT_SECONDS}s. Try a shorter video.")
        return {"passed": False, "message": f"Highlight detection timed out after {DETECT_TIMEOUT_SECONDS}s"}
    except Exception as e:
        logger.exception(f"Highlight detection crashed for job {job_id}: {e}")
        await upsert_pipeline_step(db, job_id, "detect", "failed", 0, f"Detection failed: {str(e)[:200]}")
        return {"passed": False, "message": f"Highlight detection failed: {str(e)}"}


async def _detect_highlights_impl(
    job_id: str,
    db: AsyncSession,
    start_time: float,
) -> dict:
    """Internal implementation with timeout support."""
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

    await upsert_pipeline_step(db, job_id, "detect", "running", 5,
                            "Loading transcript and preparing analysis...")

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

        total_segments = len(raw_segments)
        logger.info(f"Analyzing {total_segments} segments for job {job_id}")

        await upsert_pipeline_step(
            db, job_id, "detect", "running", 10,
            f"Analyzing {total_segments} segments with heuristic engine..."
        )

        # ── Phase 1: Heuristic Analysis (always runs, fast) ──────────────
        analyzed_segments = []
        for idx, seg in enumerate(raw_segments):
            text = seg.get("text", "").strip()
            if not text:
                continue

            start = seg.get("start", 0)
            end = seg.get("end", start + 5)

            # Skip very short or very long segments
            duration = end - start
            if duration < MIN_SEGMENT_DURATION or duration > MAX_SEGMENT_DURATION:
                continue

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

            # Granular progress: report every 10% or every 20 segments
            if total_segments > 0:
                pct = int(10 + (idx / total_segments) * 30)  # 10% → 40%
                if idx % max(1, total_segments // 20) == 0:
                    await upsert_pipeline_step(
                        db, job_id, "detect", "running", min(pct, 40),
                        f"Analyzing segment {idx + 1}/{total_segments}..."
                    )

        if not analyzed_segments:
            return {"passed": False, "message": "No valid segments found after filtering"}

        elapsed_heuristic = time.monotonic() - start_time
        logger.info(f"Heuristic analysis completed in {elapsed_heuristic:.1f}s for {len(analyzed_segments)} segments")

        # ── Phase 2: Optional LLM Enhancement ────────────────────────────
        llm_enhanced = False
        if settings.openrouter_key:
            try:
                await upsert_pipeline_step(
                    db, job_id, "detect", "running", 45,
                    "Running LLM-based quality analysis..."
                )
                analyzed_segments = await _enhance_with_llm(
                    job_id, analyzed_segments, start_time
                )
                llm_enhanced = True
                logger.info(f"LLM enhancement completed for job {job_id}")
            except Exception as e:
                logger.warning(f"LLM enhancement failed, using heuristic results: {e}")
                await upsert_pipeline_step(
                    db, job_id, "detect", "running", 50,
                    "LLM analysis unavailable, using heuristic results..."
                )

        await upsert_pipeline_step(db, job_id, "detect", "running", 70,
                                "Merging nearby segments and ranking...")

        # ── Phase 3: Merge nearby segments ───────────────────────────────
        analyzed_segments.sort(key=lambda s: s["start_seconds"])
        merged_segments = _merge_nearby_segments(analyzed_segments)

        # ── Phase 4: Rank and filter ─────────────────────────────────────
        merged_segments.sort(key=lambda s: s["virality_score"], reverse=True)
        top_segments = merged_segments[:MAX_SEGMENTS]

        # Ensure minimum coverage: if we have fewer than 3 segments, relax threshold
        if len(top_segments) < 3 and len(merged_segments) > 3:
            # Take top segments by position (early + late) as fallback
            merged_segments.sort(key=lambda s: s["start_seconds"])
            # Take evenly spaced segments
            step = max(1, len(merged_segments) // MAX_SEGMENTS)
            top_segments = [merged_segments[i] for i in range(0, len(merged_segments), step)][:MAX_SEGMENTS]

        await upsert_pipeline_step(db, job_id, "detect", "running", 85,
                                f"Saving {len(top_segments)} highlight segments...")

        # ── Phase 5: Save to database ────────────────────────────────────
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

        total_elapsed = time.monotonic() - start_time
        await upsert_pipeline_step(
            db, job_id, "detect", "complete", 100,
            f"Detected {len(top_segments)} highlight segments in {total_elapsed:.1f}s"
        )

        # NOTE: job.status is no longer set here — see the note in
        # transcribe.py. The orchestrator owns job.status.

        return {
            "passed": True,
            "message": f"Detected {len(top_segments)} highlight segments in {total_elapsed:.1f}s",
            "segments_count": len(top_segments),
            "llm_enhanced": llm_enhanced,
            "elapsed_seconds": total_elapsed,
        }

    except Exception as e:
        logger.exception(f"Highlight detection failed for job {job_id}: {e}")
        await upsert_pipeline_step(db, job_id, "detect", "failed", 0,
                                f"Detection failed: {str(e)[:200]}")
        return {"passed": False, "message": f"Highlight detection failed: {str(e)}"}


async def _enhance_with_llm(
    job_id: str,
    segments: list[dict],
    start_time: float,
) -> list[dict]:
    """
    Enhance segment analysis using OpenRouter LLM.

    Chunks segments and runs parallel LLM calls to re-score virality
    and detect more nuanced emotional signals.
    """
    if not settings.openrouter_key:
        return segments

    try:
        import httpx

        # Chunk segments into groups of 10 for LLM processing
        chunk_size = 10
        chunks = [segments[i:i + chunk_size] for i in range(0, len(segments), chunk_size)]

        async def _process_chunk(chunk: list[dict], chunk_idx: int) -> list[dict]:
            """Process a chunk of segments via LLM."""
            # Build prompt
            segments_text = "\n".join(
                f"[{i}] {s['start_seconds']:.1f}s-{s['end_seconds']:.1f}s: \"{s['transcript_excerpt'][:150]}\""
                for i, s in enumerate(chunk)
            )

            prompt = f"""You are analyzing video transcript segments to find the most engaging, clip-worthy moments.

For each segment, rate it on these dimensions (0-10):
- engagement: How engaging/captivating is this moment?
- shareability: Would people want to share this?
- information: Does it contain valuable information?
- emotion: How emotionally impactful is it?

Respond with ONLY a JSON array of objects, one per segment:
[
  {{"index": 0, "engagement": 7, "shareability": 6, "information": 8, "emotion": 5, "reason": "brief"}},
  ...
]

Segments to analyze:
{segments_text}"""

            async with httpx.AsyncClient(timeout=LLM_TIMEOUT_PER_CHUNK) as client:
                response = await client.post(
                    f"{settings.openrouter_base_url}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {settings.openrouter_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": "openai/gpt-4o-mini",
                        "messages": [
                            {"role": "system", "content": "You are a video highlight analysis assistant. Respond only with valid JSON."},
                            {"role": "user", "content": prompt},
                        ],
                        "temperature": 0.1,
                        "max_tokens": 2000,
                    },
                )

                if response.status_code != 200:
                    logger.warning(f"LLM API returned {response.status_code}: {response.text[:200]}")
                    return chunk

                data = response.json()
                content = data["choices"][0]["message"]["content"]

                # Parse JSON from response (handle markdown code blocks)
                json_match = re.search(r'\[.*?\]', content, re.DOTALL)
                if not json_match:
                    logger.warning("No JSON array found in LLM response")
                    return chunk

                llm_scores = json.loads(json_match.group())

                # Apply LLM scores to segments
                for score_entry in llm_scores:
                    idx = score_entry.get("index")
                    if idx is not None and 0 <= idx < len(chunk):
                        engagement = score_entry.get("engagement", 5)
                        shareability = score_entry.get("shareability", 5)
                        info = score_entry.get("information", 5)
                        emotion = score_entry.get("emotion", 5)

                        # Blend LLM score with heuristic virality score
                        llm_score = (engagement + shareability + info + emotion) * 2.5  # Scale to 0-100
                        chunk[idx]["virality_score"] = int(
                            chunk[idx]["virality_score"] * 0.4 + llm_score * 0.6
                        )

                        # Update emotional signal if LLM detected strong emotion
                        if emotion >= 8:
                            chunk[idx]["emotional_signal"] = "high_emotion"
                        elif emotion >= 6:
                            if chunk[idx]["emotional_signal"] == "neutral":
                                chunk[idx]["emotional_signal"] = "engaging"

                return chunk

        # Process chunks in parallel (up to 3 at a time)
        semaphore = asyncio.Semaphore(3)

        async def _limited_chunk(chunk, idx):
            async with semaphore:
                return await _process_chunk(chunk, idx)

        tasks = [_limited_chunk(chunk, i) for i, chunk in enumerate(chunks)]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        # Reassemble segments
        enhanced_segments = []
        for result in results:
            if isinstance(result, Exception):
                logger.warning(f"LLM chunk processing failed: {result}")
                continue
            enhanced_segments.extend(result)

        # If LLM processing failed for all chunks, return original
        if not enhanced_segments:
            return segments

        return enhanced_segments

    except ImportError:
        logger.warning("httpx not available for LLM enhancement")
        return segments
    except Exception as e:
        logger.warning(f"LLM enhancement error: {e}")
        return segments


def _merge_nearby_segments(segments: list[dict]) -> list[dict]:
    """
    Merge nearby segments that are close together in time.

    This prevents having many tiny adjacent clips and creates
    more natural highlight boundaries.
    """
    if not segments:
        return []

    merged = [segments[0].copy()]

    for seg in segments[1:]:
        last = merged[-1]
        gap = seg["start_seconds"] - last["end_seconds"]

        if gap <= MERGE_GAP_THRESHOLD:
            # Merge: extend end time, combine text, average scores
            last["end_seconds"] = max(last["end_seconds"], seg["end_seconds"])
            last["transcript_excerpt"] += " " + seg["transcript_excerpt"]
            last["virality_score"] = max(last["virality_score"], seg["virality_score"])
            # Keep stronger hook
            if _hook_strength_value(seg["hook_strength"]) > _hook_strength_value(last["hook_strength"]):
                last["hook_strength"] = seg["hook_strength"]
            # Keep non-neutral emotional signal
            if seg["emotional_signal"] != "neutral" and last["emotional_signal"] == "neutral":
                last["emotional_signal"] = seg["emotional_signal"]
        else:
            merged.append(seg.copy())

    return merged


def _hook_strength_value(strength: str) -> int:
    """Convert hook strength string to numeric value for comparison."""
    return {"strong": 3, "moderate": 2, "weak": 1, "Strong": 3, "Moderate": 2, "Weak": 1}.get(strength, 0)


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
    - Sentence structure (questions, exclamations)
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
    elif start > 600:
        # Late in video — still valuable (end hook)
        score += 3

    # Duration penalty (longer clips are less viral)
    if duration < 10:
        score += 10
    elif duration < 20:
        score += 5
    elif duration > 45:
        score -= 10
    elif duration > 30:
        score -= 5

    # Exclamation bonus
    if "!" in text:
        score += 5

    # Question bonus
    if "?" in text:
        score += 8

    # Length bonus (short, punchy statements)
    word_count = len(text.split())
    if word_count <= 5:
        score += 5
    elif word_count <= 10:
        score += 3

    # Number mention (lists, statistics)
    if re.search(r'\d+', text):
        score += 3

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
