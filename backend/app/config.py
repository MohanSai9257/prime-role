"""Application configuration loaded from environment variables.

No database connection is created while this module is imported. That keeps the
demo API and the test suite usable before Supabase credentials are configured.
"""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]


class AppSettings(BaseSettings):
    """Runtime settings for the API."""

    app_name: str = "Prime Role API"
    environment: str = "development"
    api_prefix: str = "/api"
    database_url: str | None = None
    base_resume_storage_dir: Path = REPOSITORY_ROOT / "data" / "base-resumes"
    cors_origins: str = (
        "http://localhost:5173,http://127.0.0.1:5173,"
        "http://localhost:3000,http://127.0.0.1:3000"
    )

    model_config = SettingsConfigDict(
        env_file=REPOSITORY_ROOT / ".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    @property
    def allowed_origins(self) -> list[str]:
        """Return configured origins as a normalized list."""

        return [
            origin.strip()
            for origin in self.cors_origins.split(",")
            if origin.strip()
        ]

    @property
    def database_configured(self) -> bool:
        """Whether a database URL has been supplied."""

        return bool(self.database_url and self.database_url.strip())


@lru_cache(maxsize=1)
def get_settings() -> AppSettings:
    """Return the process-wide configuration object."""

    return AppSettings()
