"""Unit tests for lazy Supabase database configuration."""

from app.db.models import UserSettings
from app.db.session import normalize_database_url


def test_supabase_postgres_url_uses_psycopg_driver() -> None:
    assert normalize_database_url(
        "postgresql://user:password@example.supabase.co:5432/postgres"
    ) == (
        "postgresql+psycopg://user:password@example.supabase.co:5432/postgres"
    )


def test_already_explicit_driver_is_unchanged() -> None:
    url = "postgresql+psycopg://user:password@example.test/postgres"
    assert normalize_database_url(url) == url


def test_user_settings_model_stores_built_in_company_type() -> None:
    columns = UserSettings.__table__.columns

    assert "company_type" in columns
    assert columns["company_type"].default.arg == "IMPLEMENTATION"
    assert "company_file_path" not in columns
