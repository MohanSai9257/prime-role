"""Validated, read-only access to the bundled company catalog."""

from __future__ import annotations

from pathlib import Path
from typing import Literal

from pydantic import Field, HttpUrl, ValidationError, model_validator

from app.schemas import (
    ApiModel,
    CompanyResponse,
    CompanySummaryResponse,
    CompanyType,
)

DEFAULT_CATALOG_PATH = Path(__file__).resolve().parents[1] / "data" / "companies.json"


class CompanyCatalogError(RuntimeError):
    """Raised when the bundled catalog cannot be read or validated."""


class _CompanyCatalogEntry(ApiModel):
    company_name: str = Field(min_length=1)
    headquarters: str = Field(min_length=1)
    linkedin_url: HttpUrl
    careers_url: HttpUrl


class _CompanyCatalogDocument(ApiModel):
    schema_version: Literal[1]
    source_file: str = Field(min_length=1)
    source_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    source_sheets: dict[CompanyType, str]
    companies: dict[CompanyType, list[_CompanyCatalogEntry]]

    @model_validator(mode="after")
    def require_every_company_type(self) -> "_CompanyCatalogDocument":
        expected_types = set(CompanyType)
        if set(self.source_sheets) != expected_types:
            raise ValueError("source_sheets must contain every supported company type")
        if set(self.companies) != expected_types:
            raise ValueError("companies must contain every supported company type")
        return self


class CompanyCatalogRepository:
    """Loads the catalog once, then serves immutable validated records."""

    def __init__(self, catalog_path: Path = DEFAULT_CATALOG_PATH) -> None:
        self._catalog_path = catalog_path
        self._companies_by_type = self._load_catalog(catalog_path)

    @staticmethod
    def _load_catalog(
        catalog_path: Path,
    ) -> dict[CompanyType, tuple[CompanyResponse, ...]]:
        try:
            raw_catalog = catalog_path.read_text(encoding="utf-8")
        except OSError as exc:
            raise CompanyCatalogError(
                f"Unable to read company catalog: {catalog_path}"
            ) from exc

        try:
            document = _CompanyCatalogDocument.model_validate_json(raw_catalog)
        except ValidationError as exc:
            raise CompanyCatalogError(
                f"Invalid company catalog: {catalog_path}"
            ) from exc

        companies_by_type: dict[CompanyType, tuple[CompanyResponse, ...]] = {}
        for company_type in CompanyType:
            records = tuple(
                CompanyResponse(
                    company_type=company_type,
                    **entry.model_dump(),
                )
                for entry in document.companies[company_type]
            )
            normalized_names = [
                record.company_name.strip().casefold() for record in records
            ]
            if len(normalized_names) != len(set(normalized_names)):
                raise CompanyCatalogError(
                    f"Duplicate company names in {company_type.value}"
                )
            companies_by_type[company_type] = records
        return companies_by_type

    def list(self, company_type: CompanyType | None = None) -> list[CompanyResponse]:
        """Return a copy of all records, optionally limited to one type."""

        selected_types = (company_type,) if company_type else tuple(CompanyType)
        return [
            company.model_copy(deep=True)
            for selected_type in selected_types
            for company in self._companies_by_type[selected_type]
        ]

    def count(self, company_type: CompanyType) -> int:
        return len(self._companies_by_type[company_type])

    def summary(
        self,
        company_type: CompanyType | None = None,
    ) -> list[CompanySummaryResponse]:
        """Return deterministic counts in the enum's display order."""

        selected_types = (company_type,) if company_type else tuple(CompanyType)
        return [
            CompanySummaryResponse(
                company_type=selected_type,
                label=selected_type.label,
                company_count=self.count(selected_type),
            )
            for selected_type in selected_types
        ]


company_catalog_repository = CompanyCatalogRepository()
