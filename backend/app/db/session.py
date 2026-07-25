"""Lazy SQLAlchemy engine and session construction.

Supabase supplies a PostgreSQL connection string through ``DATABASE_URL``.
Importing this module never opens a connection; the engine is constructed only
when ``get_engine`` or ``get_db`` is called.
"""

from collections.abc import Generator
from functools import lru_cache

from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import get_settings


def normalize_database_url(url: str) -> str:
    """Normalize legacy PostgreSQL schemes for psycopg 3."""

    if url.startswith("postgres://"):
        return "postgresql+psycopg://" + url.removeprefix("postgres://")
    if url.startswith("postgresql://"):
        return "postgresql+psycopg://" + url.removeprefix("postgresql://")
    return url


@lru_cache(maxsize=1)
def get_engine() -> Engine:
    settings = get_settings()
    if not settings.database_configured or settings.database_url is None:
        raise RuntimeError(
            "DATABASE_URL is not configured. Add the Supabase PostgreSQL "
            "connection string to the repository root .env before using "
            "database features."
        )

    url = normalize_database_url(settings.database_url)
    connect_args = {"check_same_thread": False} if url.startswith("sqlite") else {}
    return create_engine(url, pool_pre_ping=True, connect_args=connect_args)


@lru_cache(maxsize=1)
def get_session_factory() -> sessionmaker[Session]:
    return sessionmaker(bind=get_engine(), autoflush=False, expire_on_commit=False)


def get_db() -> Generator[Session, None, None]:
    session = get_session_factory()()
    try:
        yield session
    finally:
        session.close()
