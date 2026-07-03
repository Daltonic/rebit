"""
Sia connection and registration API router.

Uses the `sia-storage` Python SDK (v0.8.0) for native Sia operations.
The registration flow is a 2-step process driven by the frontend setup wizard.
"""

import logging

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.config import settings
from backend.app.database import get_db
from backend.app.models import AppSettings
from backend.app.schemas import (
    SiaRegisterInitRequest,
    SiaRegisterInitResponse,
    SiaRegisterCheckRequest,
    SiaRegisterCheckResponse,
    SiaStatusResponse,
)
from backend.app.services import sia_client

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/sia", tags=["sia"])


@router.get("/status", response_model=SiaStatusResponse)
async def get_sia_status(
    db: AsyncSession = Depends(get_db),
):
    """
    GET /api/sia/status

    Returns the current Sia connection state.
    Checks both the SDK state and DB settings.
    """
    # Get SDK status
    status = sia_client.get_status()

    # Check DB settings for indexer URL
    result = await db.execute(
        select(AppSettings).where(AppSettings.id == "default")
    )
    app_settings = result.scalar_one_or_none()
    indexer_url = app_settings.sia_indexer_url if app_settings else None

    return SiaStatusResponse(
        connected=status["connected"],
        mode="live" if status["connected"] else "demo",
        reason=status.get("reason"),
        indexer_url=indexer_url or status.get("indexer_url"),
    )


@router.post("/register/init", response_model=SiaRegisterInitResponse)
async def register_init(
    body: SiaRegisterInitRequest,
):
    """
    POST /api/sia/register/init

    Step 1: Start Sia registration.
    Uses the sia-storage SDK Builder to create a connection request.
    Returns an approval URL the user must visit to authorize the app.
    """
    result = await sia_client.registration_start(
        indexer_url=body.indexer_url,
        app_id_hex=body.app_id,
        app_name=body.app_name,
        app_description=body.app_description,
        recovery_phrase=body.recovery_phrase,
        service_url=settings.sia_indexer_url or "http://localhost:3000",
    )

    if result["ok"]:
        return SiaRegisterInitResponse(
            ok=True,
            approval_url=result["approval_url"],
        )
    else:
        return SiaRegisterInitResponse(
            ok=False,
            error=result["error"],
        )


@router.post("/register/check", response_model=SiaRegisterCheckResponse)
async def register_check(
    body: SiaRegisterCheckRequest,
):
    """
    POST /api/sia/register/check

    Step 2: Check if the user approved the app on the Sia network.
    If approved, the SDK derives and persists the AppKey.
    The recovery phrase is then discarded from memory.
    """
    result = await sia_client.registration_check()

    if result.get("ok") and result.get("status") == "approved":
        # Update DB to mark Sia as connected
        from backend.app.database import async_session_factory
        async with async_session_factory() as db:
            await db.execute(
                select(AppSettings).where(AppSettings.id == "default")
            )
            settings_row = (await db.execute(
                select(AppSettings).where(AppSettings.id == "default")
            )).scalar_one_or_none()
            if settings_row:
                settings_row.sia_connected = True
                await db.commit()

        return SiaRegisterCheckResponse(ok=True, status="approved")

    if not result.get("ok"):
        return SiaRegisterCheckResponse(
            ok=False,
            error=result.get("error", "Registration check failed"),
        )

    return SiaRegisterCheckResponse(ok=True, status="pending")