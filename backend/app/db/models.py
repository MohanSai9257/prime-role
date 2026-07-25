"""Supabase-ready SQLAlchemy models for the planned persistent workflow."""

from datetime import date, datetime
from typing import Any
from uuid import uuid4

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


def new_id() -> str:
    return str(uuid4())


class Job(Base):
    __tablename__ = "jobs"
    __table_args__ = (
        UniqueConstraint("company_name", "canonical_url", name="uq_job_company_url"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    company_name: Mapped[str] = mapped_column(String(200), index=True)
    job_title: Mapped[str] = mapped_column(String(300), index=True)
    canonical_url: Mapped[str] = mapped_column(Text)
    location: Mapped[str] = mapped_column(String(300), default="")
    posted_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    ats_score: Mapped[int] = mapped_column(Integer)
    sponsorship: Mapped[str] = mapped_column(String(20))
    raw_payload: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    first_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class SearchRun(Base):
    __tablename__ = "search_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    start_date: Mapped[date] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(30), default="queued")
    companies_checked: Mapped[int] = mapped_column(Integer, default=0)
    new_jobs: Mapped[int] = mapped_column(Integer, default=0)
    duplicates_skipped: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class UserSettings(Base):
    __tablename__ = "user_settings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    base_resume_path: Mapped[str] = mapped_column(Text, default="")
    company_file_path: Mapped[str] = mapped_column(Text, default="")
    output_directory: Mapped[str] = mapped_column(Text, default="")
    start_date: Mapped[date] = mapped_column(Date)
    target_roles: Mapped[list[str]] = mapped_column(JSON, default=list)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class ResumeGeneration(Base):
    __tablename__ = "resume_generations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    job_id: Mapped[str] = mapped_column(ForeignKey("jobs.id"), index=True)
    output_path: Mapped[str] = mapped_column(Text)
    previous_score: Mapped[int] = mapped_column(Integer)
    target_score: Mapped[int] = mapped_column(Integer, default=95)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    job: Mapped[Job] = relationship()
