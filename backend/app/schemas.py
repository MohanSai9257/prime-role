"""Pydantic request and response contracts used by the API."""

from datetime import date
from enum import Enum
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


class CompanyType(str, Enum):
    """Supported groups from the built-in company catalog."""

    DIRECT_CLIENT = "DIRECT_CLIENT"
    IMPLEMENTATION = "IMPLEMENTATION"
    VENDOR = "VENDOR"

    @property
    def label(self) -> str:
        return {
            CompanyType.DIRECT_CLIENT: "Direct Client",
            CompanyType.IMPLEMENTATION: "Implementation",
            CompanyType.VENDOR: "Vendor",
        }[self]


class CompanyResponse(ApiModel):
    company_name: str = Field(min_length=1)
    company_type: CompanyType
    headquarters: str = Field(min_length=1)
    linkedin_url: HttpUrl
    careers_url: HttpUrl


class CompanySummaryResponse(ApiModel):
    company_type: CompanyType
    label: str
    company_count: int = Field(ge=0)


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
    company_type: CompanyType = CompanyType.IMPLEMENTATION
    output_directory: str = ""
    start_date: date = Field(default_factory=date.today)
    target_roles: list[str] = Field(default_factory=list)

    @field_validator(
        "base_resume_path",
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


class BaseResumeUploadResponse(ApiModel):
    original_filename: str
    stored_path: str
    size_bytes: int = Field(gt=0)


class SearchRunRequest(ApiModel):
    start_date: date | None = None
    company_type: CompanyType | None = None
    target_roles: list[str] = Field(default_factory=list)


class SearchRunResponse(ApiModel):
    id: str
    status: Literal["completed"] = "completed"
    company_type: CompanyType
    companies_checked: int = Field(ge=0)
    new_jobs: int = Field(ge=0)
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
