"""User settings routes."""

from fastapi import APIRouter

from app.schemas import UserSettingsPayload, UserSettingsResponse
from app.services.settings_repository import settings_repository

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("", response_model=UserSettingsResponse)
def get_user_settings() -> UserSettingsResponse:
    return settings_repository.get()


@router.put("", response_model=UserSettingsResponse)
def replace_user_settings(payload: UserSettingsPayload) -> UserSettingsResponse:
    return settings_repository.replace(payload)
