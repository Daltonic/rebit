"""
Pydantic schemas for request/response validation.
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


# ── Pipeline Request / Response ──────────────────────────────────────────

class PipelineRequest(BaseModel):
    job_id: str = Field(alias="jobId")


class PipelineResponse(BaseModel):
    passed: bool
    message: str
    details: Optional[dict] = None


# ── Transcribe ───────────────────────────────────────────────────────────

class TranscribeRequest(BaseModel):
    job_id: str = Field(alias="jobId")


class TranscribeResponse(BaseModel):
    passed: bool
    message: str
    duration_seconds: Optional[int] = None
    word_count: Optional[int] = None


# ── Detect (Highlight Detection) ─────────────────────────────────────────

class DetectRequest(BaseModel):
    job_id: str = Field(alias="jobId")


class DetectResponse(BaseModel):
    passed: bool
    message: str
    segments_count: int = 0


# ── Extract (Clip Extraction) ────────────────────────────────────────────

class ExtractRequest(BaseModel):
    job_id: str = Field(alias="jobId")


class ExtractResponse(BaseModel):
    passed: bool
    message: str
    clips_rendered: int = 0


# ── Render ───────────────────────────────────────────────────────────────

class RenderRequest(BaseModel):
    job_id: str = Field(alias="jobId")


class RenderResponse(BaseModel):
    passed: bool
    message: str
    clips_rendered: int = 0


# ── Sia Storage ──────────────────────────────────────────────────────────

class SiaStoreRequest(BaseModel):
    job_id: str = Field(alias="jobId")


class SiaStoreResponse(BaseModel):
    passed: bool
    message: str
    sia_hash: Optional[str] = None
    sia_status: str = "pending"


# ── Sia Registration (proxied from frontend) ─────────────────────────────

class SiaRegisterInitRequest(BaseModel):
    indexer_url: str
    app_id: str
    app_name: str
    app_description: str
    recovery_phrase: str


class SiaRegisterInitResponse(BaseModel):
    ok: bool
    approval_url: Optional[str] = None
    error: Optional[str] = None


class SiaRegisterCheckRequest(BaseModel):
    indexer_url: str
    app_id: str


class SiaRegisterCheckResponse(BaseModel):
    ok: bool
    status: Optional[str] = None  # "approved" | "pending"
    error: Optional[str] = None


# ── Sia Status ───────────────────────────────────────────────────────────

class SiaStatusResponse(BaseModel):
    connected: bool
    mode: str  # "live" | "demo"
    reason: Optional[str] = None
    indexer_url: Optional[str] = None


# ── Job Status ───────────────────────────────────────────────────────────

class JobStatusResponse(BaseModel):
    id: str
    status: str
    source_filename: str
    duration_seconds: Optional[int] = None
    sia_hash: Optional[str] = None
    sia_status: str
    created_at: datetime
    updated_at: datetime
    pipeline_steps: list = []
    segments: list = []


# ── Health ───────────────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    status: str = "ok"
    version: str = "0.1.0"
    sia_mode: str = "auto"
    sia_connected: bool = False