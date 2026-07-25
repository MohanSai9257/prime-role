"""Thread-safe in-memory settings for the demo vertical slice."""

from datetime import date
from threading import RLock

from app.schemas import UserSettingsPayload, UserSettingsResponse


class InMemorySettingsRepository:
    """Stores settings until the process exits.

    The response explicitly advertises this behavior so the demo is never
    mistaken for durable Supabase persistence.
    """

    def __init__(self) -> None:
        self._lock = RLock()
        self._settings = UserSettingsPayload(
            base_resume_path="data/Mohan_Resume.docx",
            company_file_path="data/target-companies.xlsx",
            output_directory="generated-resumes",
            start_date=date(2026, 7, 25),
            target_roles=[
                "Software Engineer",
                "DevOps Engineer",
                "Platform Engineer",
            ],
        )

    def get(self) -> UserSettingsResponse:
        with self._lock:
            return UserSettingsResponse(**self._settings.model_dump())

    def replace(self, settings: UserSettingsPayload) -> UserSettingsResponse:
        with self._lock:
            self._settings = settings.model_copy(deep=True)
            return UserSettingsResponse(**self._settings.model_dump())


settings_repository = InMemorySettingsRepository()
