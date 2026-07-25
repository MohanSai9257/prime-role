"""Unit tests for lazy Supabase database configuration."""

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
