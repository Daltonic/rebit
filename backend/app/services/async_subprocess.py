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
from typing import Optional

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
) -> SubprocessResult:
    """
    Run a subprocess without blocking the event loop.

    Args:
        cmd: argv list, same as subprocess.run's first positional arg.
        timeout: seconds to wait before killing the process and
            raising SubprocessTimeoutExpired.

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

    try:
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
    except asyncio.TimeoutError:
        # Kill and reap the child so it doesn't linger as a zombie or
        # keep an output file open after we've given up waiting on it.
        try:
            proc.kill()
            await proc.wait()
        except ProcessLookupError:
            pass
        raise SubprocessTimeoutExpired(cmd, timeout)

    return SubprocessResult(
        returncode=proc.returncode,
        stdout=stdout,
        stderr=stderr,
    )
