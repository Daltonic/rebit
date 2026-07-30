"""
Async SQLAlchemy engine and session factory.
Connects to the same PostgreSQL database as the Next.js frontend.

Schema ownership: Prisma (frontend) is the ONLY thing that creates or
alters tables. This module must never run DDL. The previous version of
this file ran `Base.metadata.create_all` plus a stack of ad-hoc
ALTER TABLE calls on every backend boot — that's what raced Prisma's
`migrate deploy` and produced the P3005 crash loop. If a model here
needs a new column or constraint, add it to schema.prisma and ship it
as a Prisma migration; do not patch it in from here.
"""

import asyncio
import logging

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

logger = logging.getLogger(__name__)

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


async def wait_for_migrated_schema(max_retries: int = 20, retry_delay: float = 3.0):
    """
    Block until the schema Prisma is responsible for creating actually
    exists, instead of silently continuing and failing later on every
    query. This does not create or alter anything — it only checks for
    a column that only exists after the frontend's migrations have run,
    so a slow frontend container doesn't get raced by the backend on
    fresh deploys.

    Raises if the schema still isn't there after all retries — better
    to fail loudly on startup than serve traffic against a half-built
    database.
    """
    last_error: Exception | None = None
    for attempt in range(1, max_retries + 1):
        try:
            async with engine.connect() as conn:
                await conn.execute(text("SELECT pipeline_lock_at FROM jobs LIMIT 0"))
            logger.info("Database schema verified (Prisma migrations applied)")
            return
        except Exception as e:
            last_error = e
            logger.info(
                f"Database schema not ready yet (attempt {attempt}/{max_retries}): {e}"
            )
            await asyncio.sleep(retry_delay)

    raise RuntimeError(
        "Database schema was never ready. Has the frontend container run "
        "`prisma migrate deploy` yet? The backend does not create schema "
        "itself."
    ) from last_error


async def close_db():
    """Dispose of the engine on shutdown."""
    await engine.dispose()
