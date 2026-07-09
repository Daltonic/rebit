# Rebit

ReBit is a decentralized video clipping engine that transforms long-form videos into captivating short-form vertical clips while ensuring full self-hosting capabilities with storage solutions powered by Sia. Upload a video file or paste a URL, and watch it move through a 5-stage automated processing pipeline that transcribes, detects highlights, extracts clips, renders them as vertical 9:16 videos, and stores everything on the Sia Network.

```
Upload → Transcribe → Detect → Extract → Render → Sia Storage
```

Every stage is a durable Inngest function that survives crashes and restarts. Failed stages report exactly what to fix.

---

## What it does

Upload a video file or paste a URL and watch it move through 5 automated processing stages. Each stage updates the pipeline in real-time, and all artifacts are stored permanently on the Sia Network.

- **File Upload**: Drag-and-drop or file picker for MP4, MOV, WebM, MKV (up to 5 GB)
- **URL Import**: Import videos from YouTube, Vimeo, TikTok, Twitter/X, and more
- **Transcription**: Speech-to-text via OpenAI Whisper (local)
- **Highlight Detection**: AI-powered analysis to find engaging moments
- **Clip Extraction**: FFmpeg-based video segment extraction
- **Vertical Render**: 9:16 format conversion for short-form platforms
- **Sia Storage**: All artifacts stored on Sia decentralized network

---

## Pipeline Stages

| # | Stage | What it does |
|---|-------|-------------|
| 1 | Transcription | Extracts audio and runs Whisper speech-to-text, generating VTT and JSON transcripts |
| 2 | Highlight Detection | Analyzes transcript for hook strength, virality score, and emotional signals; creates Segment records |
| 3 | Clip Extraction | Uses FFmpeg to cut video segments based on detected highlights |
| 4 | Vertical Render | Converts clips to 9:16 aspect ratio for TikTok, Instagram Reels, YouTube Shorts |
| 5 | Sia Storage | Uploads all artifacts (source video, transcript, clips) to Sia Network for immutable storage |

---

## Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 16, TypeScript, TailwindCSS, NextAuth.js |
| Backend | Python (FastAPI), SQLAlchemy, PostgreSQL |
| Event Pipeline | Inngest (durable functions) |
| Transcription | OpenAI Whisper (local) |
| Video Processing | FFmpeg |
| Storage | Sia Network via `sia-storage` SDK |
| ORM | Prisma (frontend-owned schema) |
| Auth | NextAuth.js with Passkey (WebAuthn) support |

---

## Running It

### With Docker (recommended)

```bash
docker compose up --build
```

| Service | URL | Description |
|---------|-----|-------------|
| Frontend | http://localhost:3000 | Next.js dashboard |
| Backend | http://localhost:8000 | FastAPI pipeline executor |
| Inngest | http://localhost:8288 | Event-driven pipeline UI |
| PostgreSQL | localhost:5432 | Database |
| Ollama | localhost:11434 | Local embeddings (for future features) |

**No environment variables needed.** All configuration is handled through the browser-based Setup Wizard on first boot. Open http://localhost:3000 and complete the 3-step wizard:

1. **Sia Storage** — Configure your Sia indexer URL, App ID, and BIP-39 recovery phrase, then approve the connection via the generated approval URL.
2. **Authentication Providers** — Optionally configure Google/GitHub OAuth and WebAuthn passkey settings.
3. **Sign Up** — Create your account. The first user to sign up becomes the **super admin**.

Steps are persisted to the database — you can close and resume later. After completing the wizard you'll be redirected to the login page.

When the backend boots it eagerly initialises the Sia client. If Sia is unreachable or unapproved, it gracefully falls into **demo mode**. Uploads and pipeline stages are simulated with realistic delays. The UI is identical either way; the mode badge in the top nav tells you which you're in.

---

### Without Docker (development)

#### 1. Environment variables

Create your local env files:

```bash
# Frontend — only the database URL is required (everything else has defaults)
cat > frontend/.env << 'ENV'
DATABASE_URL=postgresql://rebit:rebit@localhost:5432/rebit
INNGEST_DEV=1
INNGEST_EVENT_KEY=local
INNGEST_SIGNING_KEY=local
INNGEST_BASE_URL=http://localhost:8288
NEXT_TELEMETRY_DISABLED=1
BACKEND_URL=http://localhost:8000
ENV

# Backend — use the example as-is (or tweak ports)
cat > backend/.env << 'ENV'
DATABASE_URL=postgresql+asyncpg://rebit:rebit@localhost:5432/rebit
CORS_ORIGINS="http://localhost:3000"
SIA_MODE="auto"
SIA_KEY_PATH="/tmp/sia/appkey.hex"
WHISPER_MODEL="base"
WHISPER_DEVICE="cpu"
UPLOAD_DIR="/tmp/rebit/uploads"
OUTPUT_DIR="/tmp/rebit/output"
DEBUG=false
ENV
```

That's it. The frontend `.env` above is the complete set of variables needed for local development. The backend `.env.example` contains defaults for the remaining backend-specific variables — adjust as needed.

#### 2. Start services individually

> **Prerequisite:** Dev mode requires **PostgreSQL** and **Ollama** already running on your machine. Make sure both are up before starting the application servers. If you don't have them running yet, start them first:

```bash
# Terminal 1 — PostgreSQL
docker run -d --name rebit_pg \
  -e POSTGRES_USER=rebit \
  -e POSTGRES_PASSWORD=rebit \
  -e POSTGRES_DB=rebit \
  -p 5432:5432 \
  postgres:16-alpine

# Terminal 2 — Ollama
docker run -d --name rebit_ollama \
  -p 11434:11434 \
  -v ollama_data:/root/.ollama \
  ollama/ollama:latest

# Pull the embedding model (optional, for future features)
docker exec rebit_ollama ollama pull nomic-embed-text
```

Once PostgreSQL and Ollama are confirmed running, start the remaining services in separate terminals:

```bash
# Terminal 3 — Inngest
npx inngest-cli@latest dev \
  -u http://localhost:3000/api/inngest \
  --no-discovery --no-poll --persist

# Terminal 4 — Backend
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# Terminal 5 — Frontend
cd frontend
npm install
npm run dev
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| Backend | http://localhost:8000 |
| Inngest | http://localhost:8288 |

**First boot:** Open http://localhost:3000 and complete the **Setup Wizard** (Sia → Providers → Sign Up). See the Docker section above for details on each step.

#### 3. Setup wizard (environment variables it saves)

The wizard persists configuration into the database via these API endpoints:

| Step | Endpoint | What it stores |
|------|----------|---------------|
| Sia | `POST /api/setup/sia` | Indexer URL, App ID, App Name, App Description, recovery phrase |
| Sia check | `POST /api/setup/sia/check` | Polls for approval completion |
| Providers | `POST /api/setup/providers` | OAuth client IDs/secrets, WebAuthn RP ID & Origin |
| Complete | `POST /api/setup/complete` | Marks setup as complete |

All values are stored in the `AppSettings` database table and read back on subsequent visits.

---

### Stopping

- **Docker:** `docker compose down`
- **Manual:** Press `Ctrl+C` in each terminal. Data persists in `/tmp/rebit/` (Sia keys, uploads, output) and Docker volumes (Postgres data, Ollama models).

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
├── docker-compose.yml            # 5-service orchestration
├── README.md
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── .env.example
│   ├── app/
│   │   ├── main.py               # FastAPI server with lifespan Sia init
│   │   ├── config.py             # Pydantic settings (env-based)
│   │   ├── database.py           # Async SQLAlchemy session
│   │   ├── models.py             # SQLAlchemy ORM models
│   │   ├── schemas.py            # Pydantic request/response models
│   │   ├── routers/
│   │   │   ├── pipeline.py       # Pipeline stage endpoints
│   │   │   ├── sia.py            # Sia connection status
│   │   │   ├── upload.py         # File upload endpoint
│   │   │   ├── url_import.py     # URL import endpoint
│   │   │   └── jobs.py           # Job management endpoints
│   │   └── services/
│   │       ├── transcribe.py     # Whisper transcription
│   │       ├── detect.py         # Highlight detection
│   │       ├── extract.py        # Clip extraction
│   │       ├── render.py         # Vertical rendering
│   │       ├── sia.py            # Sia upload orchestration
│   │       ├── sia_client.py     # Sia SDK singleton + demo fallback
│   │       └── pipeline_orchestrator.py  # 5-stage pipeline coordination
│   └── migrations/
│       └── add_source_url.sql
├── frontend/
│   ├── Dockerfile
│   ├── .env.example
│   ├── next.config.ts
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   ├── package.json
│   ├── postcss.config.mjs
│   ├── app/
│   │   ├── globals.css           # Global styles
│   │   ├── layout.tsx            # Root layout with NavBar
│   │   ├── page.tsx              # Landing page (redirects to /projects)
│   │   ├── login/
│   │   │   └── page.tsx          # Login page (passkey authentication)
│   │   ├── setup/
│   │   │   └── page.tsx          # First-run setup wizard
│   │   ├── projects/
│   │   │   ├── page.tsx          # Project listing
│   │   │   └── [id]/
│   │   │       ├── page.tsx      # Project detail
│   │   │       └── clips/
│   │   │           └── page.tsx  # Clips view
│   │   ├── upload/
│   │   │   └── page.tsx          # Video upload page
│   │   ├── settings/
│   │   │   └── page.tsx          # User settings
│   │   └── api/
│   │       ├── inngest/
│   │       │   └── route.ts      # Inngest handler
│   │       ├── setup/
│   │       │   ├── status/
│   │       │   ├── sia/
│   │       │   ├── sia/check/
│   │       │   ├── providers/
│   │       │   └── complete/
│   │       ├── sia/
│   │       │   ├── status/
│   │       │   └── events/
│   │       ├── config/
│   │       │   └── backend-url/
│   │       ├── auth/
│   │       │   ├── [...nextauth]/
│   │       │   └── passkey/
│   │       ├── jobs/
│   │       │   ├── route.ts
│   │       │   └── [id]/
│   │       │       ├── route.ts
│   │       │       └── segments/
│   │       │           └── route.ts
│   │       └── health/
│   ├── components/
│   │   ├── NavBar.tsx
│   │   ├── Sidebar.tsx
│   │   ├── SidebarContext.tsx
│   │   ├── TopNav.tsx
│   │   ├── MainContent.tsx
│   │   ├── ProjectCard.tsx
│   │   ├── ClipCard.tsx
│   │   ├── PipelineTracker.tsx
│   │   └── SiaStatus.tsx
│   ├── lib/
│   │   ├── config.ts
│   │   ├── types/
│   │   │   └── index.ts
│   │   ├── inngest/
│   │   │   ├── client.ts
│   │   │   └── pipeline.ts
│   │   ├── sia/
│   │   │   ├── client.ts
│   │   │   └── upload.ts
│   │   ├── auth/
│   │   │   ├── auth.config.ts
│   │   │   ├── auth.ts
│   │   │   ├── guards.ts
│   │   │   ├── seed.ts
│   │   │   └── webauthn.ts
│   │   └── prisma/
│   │       ├── client.ts
│   │       ├── schema.prisma
│   │       └── migrations/
│   └── public/
│       ├── file.svg
│       ├── globe.svg
│       ├── next.svg
│       ├── vercel.svg
│       └── window.svg
└── note.txt
```

---

## Architecture Notes

### Video Processing Pipeline

The backend runs inside Docker. Video processing uses FFmpeg for:
- Audio extraction (for transcription)
- Clip extraction (segment cutting)
- Vertical format conversion (9:16 aspect ratio)

All processing happens locally on the backend container. No external video processing services are used.

### Pipeline Stage Contract

Each pipeline function receives `(jobId, db)` and returns `(passed: bool, message: str)`. Stages are called by the Inngest function via HTTP POST to the backend's `/api/{stage}` endpoints. Logs are written to `PipelineStep` in the database.

The pipeline runs 5 stages sequentially. If any stage fails, the job is marked `failed` and the function stops. If all 5 pass (including Sia storage), the job moves to `complete` status.

### Sia Integration

- **Sia upload is Stage 5 of the pipeline.** Upload runs automatically as part of the processing pipeline, not during human approval.
- **Setup wizard:** First-time Sia configuration is handled by the browser-based Setup Wizard at `/setup` (Sia indexer URL, App ID, recovery phrase, approval URL flow). Derived App Key stored in `appkey.hex`, automatic reconnection on restarts.
- **Demo mode:** If Sia is unreachable or the wizard is skipped, the platform gracefully falls back to simulated uploads with fake object IDs.
- **Results:** Every video, transcript, and clip is uploaded to Sia Network, immutable, content-addressed, publicly verifiable. Anyone can verify any result by fetching the corresponding CID from the network directly.

### File Upload Flow

1. User uploads a video file or provides a URL via the frontend upload page.
2. Frontend writes the video to a shared `task_uploads` Docker volume.
3. An Inngest event (`rebit/job.created`) triggers the 5-stage processing pipeline.
4. Each stage calls the backend API, which reads the video from the shared volume.
5. After all 5 stages pass (including Sia storage), the job is marked `complete` and clips are available for viewing.

### Authentication & Authorization

- **Passkey-first:** Uses WebAuthn for passwordless authentication via passkeys (Touch ID, Face ID, security keys).
- **NextAuth.js:** Session management with JWT strategies, passkey credentials stored in the database.
- **Role-based access:** Two tiers: `user` (basic access) and `super_admin` (full access).
- **Middleware:** Route protection via `proxy.ts`. Unauthenticated users are redirected to `/login`.
- **Sidebar navigation:** Collapsible rail that adapts to user role.

### URL Import

Videos can be imported from URLs (YouTube, Vimeo, TikTok, etc.) using yt-dlp. The process:
1. User pastes a URL and clicks "Check URL" to fetch video metadata
2. User confirms the import, triggering download via yt-dlp
3. Downloaded video enters the same pipeline as file uploads

---

## Future Plans

After the initial launch milestone, the focus will shift to broadening the types of content and features the platform supports. The current video-based format is well suited for content creation, but the processing infrastructure is designed to be extensible. The following features are planned:

| Category | Description |
|----------|-------------|
| AI Enhancement | LLM-powered highlight detection with OpenRouter integration for more accurate virality scoring |
| Multi-language | Support for transcription and processing in multiple languages |
| Batch Processing | Queue multiple videos for sequential processing |
| Custom Templates | User-defined rendering templates and styles |
| Analytics | View counts, engagement metrics, and performance tracking |
| Sharing | Direct sharing to social platforms with embedded metadata |
| Webhooks | Real-time notifications for pipeline events |
| API Access | Programmatic access to the processing pipeline |

Each feature will integrate seamlessly with the existing pipeline and Sia storage infrastructure.

---

*Built in the open. Videos are reproducible, shareable, and forkable. Anyone can run the same processing pipeline and verify the results for themselves.*