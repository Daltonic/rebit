# Rebit

ReBit is a decentralized video clipping engine that transforms long-form videos into captivating short-form vertical clips while ensuring full self-hosting capabilities with storage solutions powered by Sia. Upload a video file or paste a direct media URL, and watch it move through a 6-stage automated processing pipeline that uploads to Sia, transcribes, detects highlights, extracts clips, renders them as vertical 9:16 videos, and stores everything on the Sia Network.

```
Upload → Sia Upload → Transcribe → Detect → Extract → Render → Sia Storage
```

Every stage is an async Python function with per-stage timeouts, progress reporting via SSE, and a per-job lock that prevents concurrent execution. Failed stages report exactly what to fix.

![Rebit pipeline detail view showing all six stages marked complete, with Sia upload logs and object IDs](./frontend/public/screenshots/pipeline-complete.png)

---

## What it does

Upload a video file or paste a direct media URL and watch it move through 6 automated processing stages. Each stage updates the pipeline in real-time via Server-Sent Events (SSE), and all artifacts are stored permanently on the Sia Network.

- **File Upload**: Drag-and-drop or file picker for MP4, MOV, WebM, MKV, AVI, FLV, OGV (up to 500 MB)
- **URL Import**: Import videos from direct media URLs (links ending in .mp4, .webm, .mov, etc.)
- **Sia Upload**: Source video uploaded to Sia Network as the first pipeline step
- **Transcription**: Speech-to-text via Whisper (local, no external API)
- **Highlight Detection**: Multi-strategy heuristic analysis (keyword, position, emotional signals) with optional OpenRouter LLM enhancement
- **Clip Extraction**: FFmpeg-based video segment extraction
- **Vertical Render**: 9:16 format conversion with OpenCV face detection and saliency-based subject tracking
- **Sia Storage**: All artifacts (transcripts, clips, source video) stored on Sia decentralized network

---

## Pipeline Stages

| #   | Stage               | What it does                                                                                                                                              |
| --- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0   | Sia Upload          | Uploads the source video to the Sia Network for immutable storage                                                                                         |
| 1   | Transcription       | Extracts audio and runs Whisper speech-to-text, generating VTT and JSON transcripts                                                                       |
| 2   | Highlight Detection | Analyzes transcript for hook strength, virality score, and emotional signals using heuristic analysis + optional LLM enhancement; creates Segment records |
| 3   | Clip Extraction     | Uses FFmpeg to cut video segments based on detected highlights                                                                                            |
| 4   | Vertical Render     | Converts clips to 9:16 aspect ratio with smart subject tracking (face detection → saliency → center crop)                                                 |
| 5   | Sia Storage         | Uploads all artifacts (transcript, clips, source video) to Sia Network                                                                                    |

![Rebit clip review screen showing four candidate clips, each with a numeric score, hook strength, and emotional signal label](./frontend/public/screenshots/clip-review.png)

Every candidate clip surfaces its score, hook strength, and the emotional signal that got it selected, so you can approve or reject before anything renders.

---

## Stack

| Layer                  | Tech                                                                    |
| ---------------------- | ----------------------------------------------------------------------- |
| Frontend               | Next.js 16, TypeScript, TailwindCSS v4, NextAuth.js v5                  |
| Backend                | Python (FastAPI), SQLAlchemy (async), PostgreSQL                        |
| Pipeline Orchestration | Async Python (asyncio.create_task) with per-job lock                    |
| Event Bus              | Inngest (optional event-driven triggers)                                |
| Transcription          | Whisper (local, via CLI or Python module)                               |
| Highlight Analysis     | Multi-strategy heuristic engine + optional OpenRouter LLM (GPT-4o-mini) |
| Video Processing       | FFmpeg (async subprocess)                                               |
| Subject Tracking       | OpenCV (face detection via Haar cascade + saliency detection)           |
| Storage                | Sia Network via `sia-storage` SDK v0.8.0                                |
| ORM                    | Prisma (frontend-owned schema) + SQLAlchemy (backend mirror)            |
| Auth                   | NextAuth.js with Passkey (WebAuthn), Google OAuth, GitHub OAuth         |
| Real-time Updates      | Server-Sent Events (SSE) via asyncio event queues                       |

---

## Running It

### With Docker (recommended)

```bash
docker compose up --build
```

| Service    | URL                   | Description                         |
| ---------- | --------------------- | ----------------------------------- |
| Frontend   | http://localhost:3000 | Next.js dashboard                   |
| Backend    | http://localhost:8000 | FastAPI pipeline executor           |
| Inngest    | http://localhost:8288 | Event-driven pipeline UI (optional) |
| PostgreSQL | localhost:5432        | Database                            |

**No environment variables needed.** All configuration is handled through the browser-based Setup Wizard on first boot. Open http://localhost:3000 and complete the 4-step wizard:

1. **Sia Storage** — Configure your Sia indexer URL, App ID, and BIP-39 recovery phrase, then approve the connection via the generated approval URL.
2. **OpenRouter** — Optionally configure an OpenRouter API key for LLM-enhanced highlight detection.
3. **Authentication Providers** — Optionally configure Google/GitHub OAuth and WebAuthn passkey settings.
4. **Sign Up** — Create your account using a passkey (Touch ID, Face ID, security key).

Steps are persisted to the database — you can close and resume later. After completing the wizard you'll be redirected to the login page.

When the backend boots it eagerly initialises the Sia client. If Sia is unreachable or unapproved, it gracefully falls into **demo mode**. Uploads and pipeline stages are simulated with realistic delays. The UI is identical either way; the mode badge in the top nav tells you which you're in.

---

### Without Docker (development)

#### 1. Environment variables

Only `DATABASE_URL` is required as an environment variable. All other configuration (auth secret, OAuth credentials, backend URL, etc.) can be configured through the setup wizard and stored in the database.

```bash
# Frontend — only the database URL is required
cat > frontend/.env << 'ENV'
DATABASE_URL=postgresql://rebit:rebit@localhost:5432/rebit
INNGEST_DEV=1
ENV

# Backend — use the example as-is (or tweak ports)
cat > backend/.env << 'ENV'
DATABASE_URL=postgresql+asyncpg://rebit:rebit@localhost:5432/rebit
CORS_ORIGINS="http://localhost:3000"
SIA_MODE="auto"
SIA_KEY_PATH="data/sia/appkey.hex"
WHISPER_MODEL="base"
WHISPER_DEVICE="cpu"
UPLOAD_DIR="data/uploads"
OUTPUT_DIR="data/output"
MAX_UPLOAD_SIZE_MB=500
DEBUG=false
ENV
```

#### 2. Install system dependencies

Before starting services, install FFmpeg — required for audio extraction, clip extraction, and vertical rendering:

```bash
# Debian / Ubuntu / WSL
sudo apt update && sudo apt install -y ffmpeg

# macOS
brew install ffmpeg

# Fedora
sudo dnf install -y ffmpeg

# Arch Linux
sudo pacman -S ffmpeg
```

> **Note:** Whisper is installed automatically via `pip install -r requirements.txt` (the `openai-whisper` package), but it requires FFmpeg on your system — hence the installation above.

#### 3. Start services individually

> **Prerequisite:** Dev mode requires **PostgreSQL** already running on your machine. Make sure it is up before starting the application servers.

```bash
# Terminal 1 — PostgreSQL
docker run -d --name rebit_pg \
  -e POSTGRES_USER=rebit \
  -e POSTGRES_PASSWORD=rebit \
  -e POSTGRES_DB=rebit \
  -p 5432:5432 \
  postgres:16-alpine
```

Once PostgreSQL is confirmed running, start the remaining services in separate terminals:

```bash
# Terminal 2 — Inngest (optional, for event-driven pipeline)
npx inngest-cli@latest dev \
  -u http://localhost:3000/api/inngest \
  --no-discovery --no-poll --persist

# Terminal 3 — Backend
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# Terminal 4 — Frontend
cd frontend
npm install
npx prisma generate
npm run dev
```

| Service  | URL                   |
| -------- | --------------------- |
| Frontend | http://localhost:3000 |
| Backend  | http://localhost:8000 |
| Inngest  | http://localhost:8288 |

**First boot:** Open http://localhost:3000 and complete the **Setup Wizard** (Sia → OpenRouter → Providers → Sign Up). See the Docker section above for details on each step.

#### 4. Setup wizard (environment variables it saves)

The wizard persists configuration into the database via these API endpoints:

| Step       | Endpoint                     | What it stores                                                     |
| ---------- | ---------------------------- | ------------------------------------------------------------------ |
| Sia        | `POST /api/setup/sia`        | Indexer URL, App ID, App Name, App Description, recovery phrase    |
| Sia check  | `POST /api/setup/sia/check`  | Polls for approval completion                                      |
| OpenRouter | `POST /api/setup/openrouter` | OpenRouter API key                                                 |
| Providers  | `POST /api/setup/providers`  | OAuth client IDs/secrets, WebAuthn RP ID & Origin                  |
| Complete   | `POST /api/setup/complete`   | Marks setup as complete, generates auth secret, stores backend URL |

All values are stored in the `AppSettings` database table and read back on subsequent visits. The auth secret and backend URL are also stored in the database, so only `DATABASE_URL` is needed as an environment variable.

---

### Stopping

- **Docker:** `docker compose down`
- **Manual:** Press `Ctrl+C` in each terminal. Data persists in Docker volumes (Postgres data) and local data directories.

---

## Connecting a Real Sia Indexer

The Sia SDK requires a one-time approval flow. This is handled entirely through the **Setup Wizard** at `http://localhost:3000/setup` on first boot:

1. Enter your Sia indexer URL (default `https://sia.storage`), a 32-byte hex App ID (click **Generate** to create one), and your App Name.
2. Enter your BIP-39 recovery phrase (your master key — used once to derive the App Key, never stored by the app). Leave blank to have one auto-generated.
3. Click **Start Sia Registration**. The backend saves the configuration and returns an approval URL.
4. Open that URL in your browser and approve the connection.
5. Click **"I've approved it"** to confirm. The backend derives and stores an App Key in `appkey.hex`. Subsequent boots reuse it automatically.

If you skip the wizard or Sia is unreachable, the platform runs in **demo mode** with simulated uploads — no action required.

**Recovery phrase:** If you didn't provide one, on first boot the backend auto-generates a BIP-39 recovery phrase and writes it to `phrase.enc` inside the data directory. In a production app you'd ask the user for their own phrase and never store it. For this demo, automatic generation keeps the setup frictionless.

---

## Project Layout

```
rebit/
├── docker-compose.yml          # 4-service orchestration (postgres, inngest, backend, frontend)
├── README.md
│
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── app/
│   │   ├── main.py             # FastAPI server entrypoint
│   │   ├── config.py           # Pydantic settings (env-based)
│   │   ├── database.py         # Async SQLAlchemy engine + session factory
│   │   ├── models.py           # SQLAlchemy ORM models
│   │   ├── schemas.py          # Pydantic request/response models
│   │   ├── routers/            # API route handlers (pipeline, sia, upload, jobs, clips, url_import)
│   │   └── services/           # Business logic (transcribe, detect, extract, render, sia, pipeline orchestration, events)
│   └── migrations/
│
├── frontend/
│   ├── Dockerfile
│   ├── package.json
│   ├── proxy.ts                # Route protection middleware (setup check + auth)
│   ├── app/                    # Next.js App Router — pages + API routes
│   │   ├── page.tsx            # Landing page (redirects to /projects)
│   │   ├── login/              # Login page (passkey authentication)
│   │   ├── setup/              # First-run setup wizard (Sia → OpenRouter → Providers → Sign Up)
│   │   ├── projects/           # Project listing & detail + clips view
│   │   ├── upload/             # Video upload page
│   │   ├── settings/           # User settings page
│   │   └── api/                # Next.js API routes (auth, jobs, setup, sia, upload, url-import, inngest)
│   ├── components/             # Reusable UI components (TopNav, Sidebar, PipelineTracker, SiaStatus, etc.)
│   ├── lib/                    # Shared libraries
│   │   ├── auth/               # NextAuth config, WebAuthn helpers, auth guards
│   │   ├── prisma/             # Prisma client + schema + migrations
│   │   ├── inngest/            # Inngest client + pipeline functions
│   │   ├── sia/                # Frontend Sia client + upload helpers
│   │   ├── hooks/              # Custom React hooks (usePipelineSSE)
│   │   ├── types/              # TypeScript type definitions
│   │   └── mock/               # Mock data for development
│   ├── types/                  # NextAuth type extensions
│   └── public/                 # Static assets + screenshots
│
└── docs/                       # Additional documentation
```

---

## Architecture Notes

### Pipeline Orchestration

The pipeline runs as an async Python task inside the FastAPI backend, NOT via Inngest. When a job is created (via upload or URL import), the backend calls `start_pipeline_task()` which:

1. **Acquires a per-job lock** — atomically sets `pipeline_lock_at` on the Job row. Only one caller can ever win this race, preventing duplicate pipeline executions.
2. **Spawns a background task** — `asyncio.create_task()` runs the 6 stages sequentially.
3. **Releases the lock** — when the pipeline finishes (success or failure), the lock is cleared. If the process crashes, locks older than 20 minutes are treated as abandoned and can be re-acquired.

Each stage has a per-stage timeout (5-10 minutes) enforced by `asyncio.wait_for()`. If a stage times out, the job is marked `failed` and the pipeline stops.

### Pipeline Stage Contract

Each pipeline function receives `(jobId, db)` and returns `(passed: bool, message: str)`. Stages are called sequentially by the orchestrator. Progress is written to `PipelineStep` rows via a PostgreSQL UPSERT (INSERT ... ON CONFLICT DO UPDATE) that prevents duplicate rows even under concurrent execution.

### Job Status Computation

Job status is **computed from PipelineStep rows** rather than read from the `job.status` column. This is because the orchestrator's long-running database session can cause the column to lag behind reality. The `job_status_from_step_rows()` function in `pipeline_steps.py` determines status by examining all step rows:

1. Any stage `failed` → `"failed"`
2. Any stage `running` → the corresponding status label (e.g. `"transcribing"`)
3. No rows → `"queued"`
4. All stages complete → `"complete"`
5. Otherwise → the label for the earliest missing/incomplete stage

### Real-time Updates (SSE)

Pipeline progress is streamed to the frontend via Server-Sent Events (SSE) at `GET /api/jobs/{job_id}/events`. The backend uses asyncio queues — each job gets its own queue, and pipeline stages publish events as they progress. The frontend connects to this endpoint and receives:

- `step_update` — Pipeline step progress changed (stage, status, progressPct, message)
- `job_status` — Overall job status changed
- `pipeline_complete` — All stages finished
- `sia_log` — Sia upload log entries
- `keepalive` — Sent every 30s to maintain connection

### Video Processing

The backend runs inside Docker. Video processing uses FFmpeg for:

- Audio extraction (for transcription)
- Clip extraction (segment cutting)
- Vertical format conversion (9:16 aspect ratio)

All processing happens locally on the backend container. No external video processing services are used.

### Vertical Rendering with Subject Tracking

The render stage uses a three-tier approach to keep the primary subject centered in the vertical crop:

1. **Face detection** — OpenCV's Haar cascade finds the largest face in sampled frames
2. **Saliency detection** — OpenCV's saliency module finds the visually dominant region (for non-face content like products, screens, animals)
3. **Center crop** — Final fallback if neither face nor saliency detection is available

### Highlight Detection

Stage 2 analyzes the transcript using a multi-strategy heuristic engine that evaluates:

- **Hook strength**: How engaging the opening of each segment is, scored by keyword analysis
- **Virality score**: Likelihood of being shared, based on position, duration, emotional signals, and sentence structure
- **Emotional signals**: Sentiment detection across 8 categories (excitement, surprise, urgency, curiosity, authority, positivity, negativity, contrast)

The heuristic engine runs locally and requires no external API keys. If an **OpenRouter API key** is configured, the detection is optionally enhanced with GPT-4o-mini for higher-quality scoring. Nearby segments are merged for natural boundaries, and the top segments by score are selected as clips.

### Sia Integration

- **Sia upload is Stage 0 and Stage 5 of the pipeline.** Stage 0 uploads the source video; Stage 5 uploads all artifacts (transcript, clips, source video).
- **Setup wizard:** First-time Sia configuration is handled by the browser-based Setup Wizard at `/setup` (Sia indexer URL, App ID, recovery phrase, approval URL flow). Derived App Key stored in `appkey.hex`, automatic reconnection on restarts.
- **Key persistence:** The AppKey is stored on disk at the path specified by `SIA_KEY_PATH`. A legacy path at `/tmp/sia/appkey.hex` is automatically migrated on first boot.
- **Demo mode:** If Sia is unreachable or the wizard is skipped, the platform gracefully falls back to simulated uploads with fake object IDs prefixed with `demo-sia-`.
- **Object ID validation:** The `is_real_object_id()` function validates that object IDs are genuine 64-char hex strings before passing them to the live SDK, preventing confusing "hex error: Unexpected length" errors.
- **Results:** Every video, transcript, and clip is uploaded to Sia Network, immutable, content-addressed, publicly verifiable. Anyone can verify any result by fetching the corresponding CID from the network directly.

### File Upload Flow

1. User uploads a video file or provides a direct media URL via the frontend upload page.
2. Frontend proxies the upload to the backend API (with auth context).
3. Backend saves the video to a shared `task_uploads` Docker volume and creates a Job record.
4. The pipeline starts automatically in the background via `start_pipeline_task()`.
5. Each stage processes the video from the shared volume and writes results to the database.
6. After all 6 stages pass (including Sia storage), the job is marked `complete` and clips are available for viewing.

### URL Import

Videos can be imported from **direct media URLs only** (links ending in .mp4, .webm, .mov, .mkv, etc.). The process:

1. User pastes a URL and clicks "Check URL" to fetch video metadata
2. The backend probes the URL using multiple strategies (extension check, query parameter analysis, HTTP HEAD/Ranged GET)
3. User confirms the import, triggering the download with browser-like headers to avoid CDN blocks
4. Downloaded video is eagerly uploaded to Sia, then enters the same pipeline as file uploads

> **Note:** YouTube, Vimeo, TikTok, and Twitter/X URLs are NOT supported. Only direct media file URLs work.

### Authentication & Authorization

- **Passkey-first:** Uses WebAuthn for passwordless authentication via passkeys (Touch ID, Face ID, security keys). First-time registration creates a user account automatically.
- **NextAuth.js v5:** Session management with JWT strategies, passkey credentials stored in the database. Auth secret is stored in the database (AppSettings table) — only `DATABASE_URL` is required as an environment variable.
- **OAuth providers:** Google and GitHub OAuth can be configured through the setup wizard. Provider credentials are stored in the database.
- **Lazy initialization:** NextAuth is initialized lazily using database-backed secrets. If no secret is configured yet (during initial setup), a mock instance returns 503 for API routes.
- **Middleware:** Route protection via `proxy.ts`. Unauthenticated users are redirected to `/login`. The middleware also checks if setup is complete and redirects to `/setup` if not.
- **Sidebar navigation:** Collapsible rail that adapts to user role.

### Clip Serving

Clips are served via `GET /api/jobs/{job_id}/clips/{segment_id}` with proper HTTP Range (partial content) support for HTML5 video seeking. Sources tried in order:

1. **Sia network** (primary) — downloaded and cached locally for subsequent range requests
2. **Local filesystem** (fast-path fallback) — served directly if the pipeline just finished

### Local File Cleanup

After all artifacts are successfully stored on Sia, local files are automatically removed to prevent the server from filling up. Cleanup removes:

- Source video from the upload directory
- Entire output tree (clips, rendered videos, etc.)

Cleanup only runs when ALL uploads succeeded. If any upload failed, local files are preserved for retry.

---

## Future Plans

After the initial launch milestone, the focus will shift to broadening the types of content and features the platform supports. The current video-based format is well suited for content creation, but the processing infrastructure is designed to be extensible. The following features are planned:

| Category         | Description                                                    |
| ---------------- | -------------------------------------------------------------- |
| Multi-language   | Support for transcription and processing in multiple languages |
| Batch Processing | Queue multiple videos for sequential processing                |
| Custom Templates | User-defined rendering templates and styles                    |
| Analytics        | View counts, engagement metrics, and performance tracking      |
| Sharing          | Direct sharing to social platforms with embedded metadata      |
| Webhooks         | Real-time notifications for pipeline events                    |
| API Access       | Programmatic access to the processing pipeline                 |

Each feature will integrate seamlessly with the existing pipeline and Sia storage infrastructure.

---

_Built in the open. Videos are reproducible, shareable, and forkable. Anyone can run the same processing pipeline and verify the results for themselves._
