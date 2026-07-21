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


async def close_db():
    """Dispose of the engine on shutdown."""
    await engine.dispose()