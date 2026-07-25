"""Pydantic request and response contracts used by the API."""

from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_validator

SponsorshipStatus = Literal["Confirmed", "Unclear", "No"]


class ApiModel(BaseModel):
    """Base model with strict, frontend-friendly response behavior."""

    model_config = ConfigDict(extra="forbid")


class HealthResponse(ApiModel):
    status: Literal["ok"] = "ok"
    service: str
    mode: Literal["demo"] = "demo"
    database_configured: bool


class JobResponse(ApiModel):
    id: str
    company_name: str
    job_title: str
    job_url: HttpUrl
    location: str
    posted_at: str | None
    ats_score: int = Field(ge=0, le=100)
    sponsorship: SponsorshipStatus
    is_demo: Literal[True] = True


class UserSettingsPayload(ApiModel):
    base_resume_path: str = ""
    company_file_path: str = ""
    output_directory: str = ""
    start_date: date = Field(default_factory=date.today)
    target_roles: list[str] = Field(default_factory=list)

    @field_validator(
        "base_resume_path",
        "company_file_path",
        "output_directory",
        mode="before",
    )
    @classmethod
    def normalize_path(cls, value: object) -> str:
        return str(value or "").strip()

    @field_validator("target_roles", mode="before")
    @classmethod
    def normalize_target_roles(cls, value: object) -> list[str]:
        if value is None:
            return []
        if isinstance(value, str):
            value = value.split(",")
        if not isinstance(value, (list, tuple, set)):
            raise ValueError("target_roles must be a list or comma-separated string")
        return list(dict.fromkeys(str(role).strip() for role in value if str(role).strip()))


class UserSettingsResponse(UserSettingsPayload):
    persistence: Literal["in_memory_demo"] = "in_memory_demo"


class SearchRunRequest(ApiModel):
    start_date: date | None = None
    company_file_path: str | None = None
    target_roles: list[str] = Field(default_factory=list)


class SearchRunResponse(ApiModel):
    id: str
    status: Literal["completed"] = "completed"
    companies_checked: Literal[250] = 250
    new_jobs: Literal[3] = 3
    duplicates_skipped: int = Field(ge=0)
    is_demo: Literal[True] = True
    message: str


class TailorResumeResponse(ApiModel):
    job_id: str
    status: Literal["demo"] = "demo"
    output_path: str
    previous_score: int = Field(ge=0, le=100)
    target_score: Literal[95] = 95
    message: str
