"""
Async SQLAlchemy engine and session factory.
Connects to the same PostgreSQL database as the Next.js frontend.
"""

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

engine = create_async_engine(
    settings.database_url,
    echo=settings.debug,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
)

async_session_factory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    """FastAPI dependency that yields an async DB session."""
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def get_db_optional() -> AsyncSession | None:
    """
    FastAPI dependency that yields an async DB session, or None if the
    database is unavailable. Use this for endpoints that should still
    work (e.g. return degraded status) when PostgreSQL is not running.
    """
    try:
        async with async_session_factory() as session:
            yield session
            await session.commit()
    except Exception:
        yield None


async def init_db():
    """Create all tables and run migrations. Called on application startup."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

        # ── Run pending migrations ────────────────────────────────────
        # SQLAlchemy's create_all does NOT add new columns to existing tables.
        # We need to run ALTER TABLE for any schema changes.

        await conn.run_sync(_migrate_job_status_enum)
        await conn.run_sync(_migrate_add_source_url)
        await conn.run_sync(_migrate_add_pipeline_lock_column)
        await conn.run_sync(_migrate_dedupe_pipeline_steps)
        await conn.run_sync(_migrate_add_pipeline_step_unique_constraint)


def _migrate_job_status_enum(conn):
    """Add 'uploaded' to JobStatus enum if missing."""
    from sqlalchemy import text

    try:
        conn.execute(
            text("ALTER TYPE \"JobStatus\" ADD VALUE IF NOT EXISTS 'uploaded'")
        )
        import logging
        logging.getLogger(__name__).info("Migration: added 'uploaded' to JobStatus enum")
    except Exception as e:
        import logging
        logging.getLogger(__name__).debug(f"Migration: JobStatus enum already had 'uploaded' or could not add: {e}")


def _migrate_add_source_url(conn):
    """Add source_url column to jobs table if it doesn't exist."""
    from sqlalchemy import inspect, text

    inspector = inspect(conn)
    columns = [c["name"] for c in inspector.get_columns("jobs")]

    if "source_url" not in columns:
        conn.execute(text("ALTER TABLE jobs ADD COLUMN source_url VARCHAR"))
        import logging
        logging.getLogger(__name__).info("Migration: added source_url column to jobs table")
    else:
        import logging
        logging.getLogger(__name__).debug("Migration: source_url column already exists")


def _migrate_add_pipeline_lock_column(conn):
    """
    Add pipeline_lock_at column to jobs table if it doesn't exist.

    This backs the single-flight lock in pipeline_orchestrator.py that
    stops multiple run_pipeline() tasks from executing concurrently for
    the same job (the root cause of the duplicate-stage / stuck-stage
    bugs — see the pipeline reliability report).
    """
    from sqlalchemy import inspect, text
    import logging

    inspector = inspect(conn)
    columns = [c["name"] for c in inspector.get_columns("jobs")]

    if "pipeline_lock_at" not in columns:
        conn.execute(text("ALTER TABLE jobs ADD COLUMN pipeline_lock_at TIMESTAMPTZ"))
        logging.getLogger(__name__).info("Migration: added pipeline_lock_at column to jobs table")
    else:
        logging.getLogger(__name__).debug("Migration: pipeline_lock_at column already exists")


def _migrate_dedupe_pipeline_steps(conn):
    """
    Remove duplicate (job_id, stage) rows from pipeline_steps BEFORE the
    unique constraint migration runs, otherwise adding that constraint
    will fail outright on any database that already has duplicates from
    the old race condition.

    For each (job_id, stage) group, keeps the "best" row: complete over
    failed over running over pending, tie-broken by the most recent
    started_at, then by id. Everything else in the group is deleted.
    """
    from sqlalchemy import text
    import logging

    result = conn.execute(text("""
        DELETE FROM pipeline_steps
        WHERE id IN (
            SELECT id FROM (
                SELECT
                    id,
                    ROW_NUMBER() OVER (
                        PARTITION BY job_id, stage
                        ORDER BY
                            CASE status
                                WHEN 'complete' THEN 4
                                WHEN 'failed' THEN 3
                                WHEN 'running' THEN 2
                                ELSE 1
                            END DESC,
                            started_at DESC NULLS LAST,
                            id DESC
                    ) AS rn
                FROM pipeline_steps
            ) ranked
            WHERE rn > 1
        )
    """))
    if result.rowcount:
        logging.getLogger(__name__).info(
            f"Migration: removed {result.rowcount} duplicate pipeline_steps row(s)"
        )


def _migrate_add_pipeline_step_unique_constraint(conn):
    """Add a UNIQUE (job_id, stage) constraint to pipeline_steps if missing."""
    from sqlalchemy import inspect, text
    import logging

    inspector = inspect(conn)
    constraints = inspector.get_unique_constraints("pipeline_steps")
    existing_names = {c["name"] for c in constraints}

    # Also treat an equivalent constraint under a different name as satisfying this.
    has_equivalent = any(
        set(c["column_names"]) == {"job_id", "stage"} for c in constraints
    )

    if "uq_pipeline_step_job_stage" not in existing_names and not has_equivalent:
        conn.execute(text(
            "ALTER TABLE pipeline_steps "
            "ADD CONSTRAINT uq_pipeline_step_job_stage UNIQUE (job_id, stage)"
        ))
        logging.getLogger(__name__).info(
            "Migration: added uq_pipeline_step_job_stage unique constraint"
        )
    else:
        logging.getLogger(__name__).debug(
            "Migration: pipeline_steps unique constraint already exists"
        )


async def close_db():
    """Dispose of the engine on shutdown."""
    await engine.dispose()
