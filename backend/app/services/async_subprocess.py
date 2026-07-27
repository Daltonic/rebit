"""
Async subprocess helpers.

Every pipeline stage shells out to ffmpeg, ffprobe, or whisper. The
naive way to do that from an async function is `subprocess.run(...)`,
but that call is synchronous — it parks the entire asyncio event loop
until the child process exits. On a normal single-worker FastAPI
process, that means every other request (the SSE stream, job-status
polling, even a plain health check) is frozen for as long as ffmpeg or
whisper is running. For a whisper transcription or a multi-clip
ffmpeg render, that's minutes, not milliseconds — which is exactly why
the job page sits on a spinner while a video is processing.

`run_subprocess()` replaces `subprocess.run()` with
`asyncio.create_subprocess_exec()`, which uses non-blocking pipes and
hands control back to the event loop while the child process runs.
The signature is intentionally close to `subprocess.run()` so call
sites only need small changes.
"""

import asyncio
import logging
from dataclasses import dataclass
from typing import Awaitable, Callable, Optional

logger = logging.getLogger(__name__)


@dataclass
class SubprocessResult:
    returncode: int
    stdout: bytes
    stderr: bytes


class SubprocessTimeoutExpired(Exception):
    """
    Raised when a subprocess exceeds its timeout.

    Mirrors subprocess.TimeoutExpired closely enough that existing
    `except subprocess.TimeoutExpired:` call sites only need the
    import swapped, not the except-block logic.
    """

    def __init__(self, cmd: list[str], timeout: Optional[float]):
        self.cmd = cmd
        self.timeout = timeout
        super().__init__(f"Command {cmd} timed out after {timeout}s")


async def run_subprocess(
    cmd: list[str],
    timeout: Optional[float] = None,
    progress_callback: Optional[Callable[[], Awaitable[None]]] = None,
    progress_interval: float = 15.0,
) -> SubprocessResult:
    """
    Run a subprocess without blocking the event loop.

    Args:
        cmd: argv list, same as subprocess.run's first positional arg.
        timeout: seconds to wait before killing the process and
            raising SubprocessTimeoutExpired.
        progress_callback: optional no-arg async callable invoked every
            `progress_interval` seconds while the process is still
            running. This is what lets a 9-minute whisper call or a
            30-second ffmpeg render publish "still processing" events
            instead of going completely silent — `proc.communicate()`
            itself has no hook for partial progress, so a sibling task
            ticks alongside it and calls back on a timer.
        progress_interval: seconds between progress_callback calls.

    Returns:
        SubprocessResult with returncode, stdout, stderr (bytes) — the
        same fields call sites were already pulling off
        subprocess.run's CompletedProcess.
    """
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )

    communicate_task = asyncio.ensure_future(proc.communicate())
    ticker_task: Optional[asyncio.Task] = None

    if progress_callback is not None:

        async def _tick():
            while True:
                await asyncio.sleep(progress_interval)
                try:
                    await progress_callback()
                except Exception as e:
                    logger.warning(f"progress_callback failed for {cmd[0]}: {e}")

        ticker_task = asyncio.ensure_future(_tick())

    try:
        stdout, stderr = await asyncio.wait_for(communicate_task, timeout=timeout)
    except asyncio.TimeoutError:
        # Kill and reap the child so it doesn't linger as a zombie or
        # keep an output file open after we've given up waiting on it.
        try:
            proc.kill()
            await proc.wait()
        except ProcessLookupError:
            pass
        raise SubprocessTimeoutExpired(cmd, timeout)
    finally:
        if ticker_task is not None:
            ticker_task.cancel()
            try:
                await ticker_task
            except asyncio.CancelledError:
                pass

    return SubprocessResult(
        returncode=proc.returncode,
        stdout=stdout,
        stderr=stderr,
    )
