"""Health route."""

from fastapi import APIRouter, Depends

from app.config import AppSettings, get_settings
from app.schemas import HealthResponse

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
def health(settings: AppSettings = Depends(get_settings)) -> HealthResponse:
    """Return API availability without attempting a database connection."""

    return HealthResponse(
        service=settings.app_name,
        database_configured=settings.database_configured,
    )
