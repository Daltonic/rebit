# ReBit Backend — Python FastAPI
# Multi-stage build for production

# ── Builder ──────────────────────────────────────────────────────────────
FROM python:3.12-slim AS builder

WORKDIR /app

# Install build dependencies (gcc needed for some Python packages)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy only the requirements file first for layer caching
COPY requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

# ── Runtime ──────────────────────────────────────────────────────────────
FROM python:3.12-slim

WORKDIR /app

# Install runtime system dependencies:
#   ffmpeg   — audio extraction, clip cutting, vertical rendering
#   curl     — healthcheck
# NOTE: opencv-contrib-python-headless is the headless variant and does
# NOT need libGL or any display libraries — that's the whole point of
# the -headless suffix. The standard opencv-python would need them, but
# we use the headless variant specifically for server environments.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy installed Python packages from builder stage
COPY --from=builder /root/.local /root/.local

# Ensure local binaries (uvicorn, whisper, etc.) are in PATH
ENV PATH=/root/.local/bin:$PATH

# Pre-download the Whisper model weights so they're baked into the image
# instead of being downloaded on first pipeline run. The default model is
# "base" (~150 MB). If WHISPER_MODEL is overridden at runtime to a
# different value (e.g. "small", "medium"), the new model will be
# downloaded on demand — but the base model is always cached.
RUN python3 -c "import whisper; whisper.load_model('base')" && \
    rm -rf /root/.cache/whisper/*.tmp

# Copy application code
# NOTE: The Docker build context is ./backend, so COPY . . places the
# contents of the backend/ directory (app/, migrations/, etc.) into /app.
# The Python module path is therefore app.main, NOT backend.app.main.
COPY . .

# Create storage directories for uploads, output, and Sia key data
RUN mkdir -p /tmp/rebit/uploads /tmp/rebit/output /tmp/sia

EXPOSE 8000

ENV HOST="0.0.0.0"
ENV PORT=8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Run with a single worker in production — the pipeline uses asyncio
# background tasks which don't work correctly with multiple workers.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]