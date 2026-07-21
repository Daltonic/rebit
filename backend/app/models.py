"""
SQLAlchemy ORM models that mirror the Prisma schema.

These models map to the same PostgreSQL database that Next.js manages
via Prisma migrations. The Prisma schema uses @map to convert camelCase
field names to snake_case DB column names. Our Python attribute names
already use snake_case, so they match the DB columns directly.
"""

import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum as SAEnum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class AppSettings(Base):
    __tablename__ = "app_settings"

    id: Mapped[str] = mapped_column(String, primary_key=True, default="default")
    setup_complete: Mapped[bool] = mapped_column("setupComplete", Boolean, default=False)
    sia_connected: Mapped[bool] = mapped_column("siaConnected", Boolean, default=False)
    sia_indexer_url: Mapped[Optional[str]] = mapped_column("siaIndexerUrl", String, nullable=True)
    sia_app_id: Mapped[Optional[str]] = mapped_column("siaAppId", String, nullable=True)
    sia_app_name: Mapped[Optional[str]] = mapped_column("siaAppName", String, nullable=True)
    sia_app_description: Mapped[Optional[str]] = mapped_column("siaAppDescription", String, nullable=True)
    openrouter_key: Mapped[Optional[str]] = mapped_column("openrouterKey", String, nullable=True)
    google_client_id: Mapped[Optional[str]] = mapped_column("googleClientId", String, nullable=True)
    google_client_secret: Mapped[Optional[str]] = mapped_column("googleClientSecret", String, nullable=True)
    github_client_id: Mapped[Optional[str]] = mapped_column("githubClientId", String, nullable=True)
    github_client_secret: Mapped[Optional[str]] = mapped_column("githubClientSecret", String, nullable=True)
    webauthn_rp_id: Mapped[Optional[str]] = mapped_column("webauthnRpId", String, nullable=True)
    webauthn_origin: Mapped[Optional[str]] = mapped_column("webauthnOrigin", String, nullable=True)
    difficulty_max_retries: Mapped[int] = mapped_column("difficultyMaxRetries", Integer, default=3)
    updated_at: Mapped[datetime] = mapped_column(
        "updatedAt",
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    status: Mapped[str] = mapped_column(
        SAEnum(
            "uploading",
            "transcribing",
            "detecting",
            "extracting",
            "rendering",
            "storing",
            "uploaded",
            "complete",
            "failed",
            name="JobStatus",
            create_type=False,
        ),
        default="uploading",
    )
    source_filename: Mapped[str] = mapped_column(String)
    source_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    source_sia_object_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    duration_seconds: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    sia_hash: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    indexd_key: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    sia_status: Mapped[str] = mapped_column(
        SAEnum(
            "pending",
            "queued",
            "uploading",
            "pinning",
            "ready",
            "failed",
            name="SiaStatus",
            create_type=False,
        ),
        default="pending",
    )
    user_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    # Pipeline execution lock. NULL means no pipeline task is currently
    # running for this job. When a pipeline task starts, it atomically
    # sets this to the current timestamp (via a single UPDATE ... WHERE
    # pipeline_lock_at IS NULL, so only one caller can ever "win" the
    # race), and clears it back to NULL when it finishes. A lock older
    # than PIPELINE_LOCK_STALE_AFTER (see pipeline_orchestrator.py) is
    # treated as abandoned (e.g. the process crashed) and can be
    # re-acquired, so a bad deploy can't permanently wedge a job.
    pipeline_lock_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    transcript: Mapped[Optional["Transcript"]] = relationship(back_populates="job", uselist=False)
    segments: Mapped[list["Segment"]] = relationship(back_populates="job")
    pipeline_steps: Mapped[list["PipelineStep"]] = relationship(back_populates="job")
    sia_logs: Mapped[list["SiaLog"]] = relationship(back_populates="job")


class Transcript(Base):
    __tablename__ = "transcripts"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: uuid.uuid4().hex)
    job_id: Mapped[str] = mapped_column(String, ForeignKey("jobs.id", ondelete="CASCADE"), unique=True)
    vtt_content: Mapped[str] = mapped_column(Text)
    json_content: Mapped[dict] = mapped_column(JSON)
    sia_object_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    job: Mapped["Job"] = relationship(back_populates="transcript")


class Segment(Base):
    __tablename__ = "segments"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: uuid.uuid4().hex)
    job_id: Mapped[str] = mapped_column(String, ForeignKey("jobs.id", ondelete="CASCADE"))
    start_seconds: Mapped[float] = mapped_column(Float)
    end_seconds: Mapped[float] = mapped_column(Float)
    hook_strength: Mapped[str] = mapped_column(String)
    virality_score: Mapped[int] = mapped_column(Integer)
    emotional_signal: Mapped[str] = mapped_column(String)
    transcript_excerpt: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(
        SAEnum(
            "pending",
            "approved",
            "rejected",
            name="SegmentStatus",
            create_type=False,
        ),
        default="pending",
    )
    clip_path: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    sia_object_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    job: Mapped["Job"] = relationship(back_populates="segments")


class PipelineStep(Base):
    __tablename__ = "pipeline_steps"
    __table_args__ = (
        # This is what makes upsert_pipeline_step() in pipeline_steps.py
        # safe: the database itself refuses to hold two rows for the
        # same (job_id, stage), so there is no gap left for two
        # concurrent writers to both "successfully" insert a duplicate.
        UniqueConstraint("job_id", "stage", name="uq_pipeline_step_job_stage"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: uuid.uuid4().hex)
    job_id: Mapped[str] = mapped_column(String, ForeignKey("jobs.id", ondelete="CASCADE"))
    stage: Mapped[str] = mapped_column(String)
    status: Mapped[str] = mapped_column(
        SAEnum(
            "pending",
            "running",
            "complete",
            "failed",
            name="StageStatus",
            create_type=False,
        ),
        default="pending",
    )
    progress_pct: Mapped[int] = mapped_column(Integer, default=0)
    message: Mapped[str] = mapped_column(String, default="")
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    job: Mapped["Job"] = relationship(back_populates="pipeline_steps")


class SiaLog(Base):
    __tablename__ = "sia_logs"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: uuid.uuid4().hex)
    job_id: Mapped[str] = mapped_column(String, ForeignKey("jobs.id", ondelete="CASCADE"))
    step: Mapped[str] = mapped_column(String)
    passed: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    message: Mapped[str] = mapped_column(String, default="")
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    job: Mapped["Job"] = relationship(back_populates="sia_logs")
