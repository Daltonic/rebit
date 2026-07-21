"""
Pipeline event bus using asyncio queues.

Each job gets its own event queue. Pipeline stages publish progress
updates to the queue, and SSE endpoints stream them to the frontend
in real time. No polling required.

Usage (publisher side):
    from app.services.pipeline_events import publish_event
    await publish_event(job_id, {
        "type": "step_update",
        "stage": "detect",
        "status": "running",
        "progressPct": 55,
        "message": "Analyzing segment 45/120...",
    })

Usage (SSE endpoint):
    from app.services.pipeline_events import subscribe
    async for event in subscribe(job_id):
        yield f"data: {json.dumps(event)}\n\n"
"""

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)

# ── Event Queue Registry ─────────────────────────────────────────────────
# Maps job_id -> asyncio.Queue of event dicts
_job_queues: dict[str, asyncio.Queue] = {}

# How long to keep a job's queue alive after the last subscriber leaves
_CLEANUP_DELAY = 30  # seconds


def _get_queue(job_id: str) -> asyncio.Queue:
    """Get or create an event queue for a job."""
    if job_id not in _job_queues:
        _job_queues[job_id] = asyncio.Queue(maxsize=500)
    return _job_queues[job_id]


async def publish_event(job_id: str, event: dict):
    """
    Publish a pipeline progress event for a job.

    All connected SSE subscribers will receive this event in real time.
    This is fire-and-forget — if the queue is full, the event is dropped
    with a warning rather than blocking the pipeline.

    Args:
        job_id: The job ID to publish for.
        event: Dict with at minimum a "type" field.
               Common types: "step_update", "job_status", "pipeline_complete".
    """
    try:
        # Always add a timestamp
        event["timestamp"] = datetime.now(timezone.utc).isoformat()

        queue = _get_queue(job_id)
        try:
            queue.put_nowait(event)
        except asyncio.QueueFull:
            logger.warning(f"Event queue full for job {job_id}, dropping event: {event.get('type')}")
    except Exception as e:
        logger.warning(f"Failed to publish event for job {job_id}: {e}")


async def publish_step_update(
    job_id: str,
    stage: str,
    status: str,
    progress_pct: int,
    message: str,
):
    """
    Convenience method to publish a standard step_update event.

    Call this from pipeline stages whenever progress changes.
    The frontend receives these instantly via SSE.
    """
    await publish_event(job_id, {
        "type": "step_update",
        "stage": stage,
        "status": status,
        "progressPct": progress_pct,
        "message": message,
    })


async def publish_job_status(job_id: str, status: str, message: str = ""):
    """Publish a job-level status change event."""
    await publish_event(job_id, {
        "type": "job_status",
        "status": status,
        "message": message,
    })


async def subscribe(job_id: str):
    """
    Subscribe to events for a job.

    Returns an async iterator of event dicts. Used by SSE endpoints.
    Automatically sends a "connected" event on subscription.
    Automatically cleans up the queue when the subscriber disconnects.

    Yields:
        Event dicts to be serialized as SSE data.
    """
    queue = _get_queue(job_id)
    subscriber_count = _increment_subscribers(job_id)

    # Send connection confirmation
    yield {
        "type": "connected",
        "jobId": job_id,
        "subscriberCount": subscriber_count,
    }

    try:
        while True:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=30)
                yield event
            except asyncio.TimeoutError:
                # Send keepalive to maintain SSE connection
                yield {
                    "type": "keepalive",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }
    except asyncio.CancelledError:
        pass
    finally:
        _decrement_subscribers(job_id)
        # Schedule cleanup if no more subscribers
        asyncio.create_task(_schedule_cleanup(job_id))


# ── Subscriber Tracking ──────────────────────────────────────────────────

_subscriber_counts: dict[str, int] = {}

_cleanup_tasks: dict[str, asyncio.Task] = {}


def _increment_subscribers(job_id: str) -> int:
    """Track number of active SSE connections for a job."""
    count = _subscriber_counts.get(job_id, 0) + 1
    _subscriber_counts[job_id] = count

    # Cancel any pending cleanup task
    if job_id in _cleanup_tasks:
        _cleanup_tasks[job_id].cancel()
        del _cleanup_tasks[job_id]

    return count


def _decrement_subscribers(job_id: str):
    """Decrement subscriber count."""
    count = _subscriber_counts.get(job_id, 0)
    if count <= 1:
        _subscriber_counts.pop(job_id, None)
    else:
        _subscriber_counts[job_id] = count - 1


async def _schedule_cleanup(job_id: str):
    """
    Schedule cleanup of a job's event queue after a delay.

    This prevents memory leaks when the frontend navigates away
    but gives time for reconnection if it comes back quickly.
    """
    try:
        await asyncio.sleep(_CLEANUP_DELAY)

        # Only clean up if no subscribers reconnected
        if job_id not in _subscriber_counts or _subscriber_counts.get(job_id, 0) == 0:
            _job_queues.pop(job_id, None)
            _subscriber_counts.pop(job_id, None)
            logger.debug(f"Cleaned up event queue for job {job_id}")
    except asyncio.CancelledError:
        pass