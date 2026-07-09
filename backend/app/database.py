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

        await conn.run_sync(_migrate_add_source_url)
        await conn.run_sync(_migrate_app_settings_youtube_cookies)


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


def _migrate_app_settings_youtube_cookies(conn):
    """
    Add youtube_cookies columns to app_settings table if they don't exist.

    These columns are defined in the SQLAlchemy AppSettings model but may not
    exist in the actual PostgreSQL table if the table was created by Prisma's
    initial migration before these fields were added.
    """
    import logging
    from sqlalchemy import inspect, text

    logger = logging.getLogger(__name__)

    inspector = inspect(conn)
    columns = [c["name"] for c in inspector.get_columns("app_settings")]

    if "youtubeCookiesSize" not in columns:
        conn.execute(text("ALTER TABLE app_settings ADD COLUMN \"youtubeCookiesSize\" INTEGER"))
        logger.info("Migration: added youtubeCookiesSize column to app_settings table")
    else:
        logger.debug("Migration: youtubeCookiesSize column already exists")

    if "youtubeCookiesUpdatedAt" not in columns:
        conn.execute(text("ALTER TABLE app_settings ADD COLUMN \"youtubeCookiesUpdatedAt\" TIMESTAMP(3)"))
        logger.info("Migration: added youtubeCookiesUpdatedAt column to app_settings table")
    else:
        logger.debug("Migration: youtubeCookiesUpdatedAt column already exists")


async def close_db():
    """Dispose of the engine on shutdown."""
    await engine.dispose()