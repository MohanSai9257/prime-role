"""Unit tests for the validated, process-local company catalog."""

import json
from pathlib import Path

import pytest

from app.schemas import CompanyType
from app.services.company_catalog_repository import (
    DEFAULT_CATALOG_PATH,
    CompanyCatalogError,
    CompanyCatalogRepository,
)


def test_repository_keeps_validated_catalog_in_memory(tmp_path: Path) -> None:
    temporary_catalog = tmp_path / "companies.json"
    temporary_catalog.write_text(
        DEFAULT_CATALOG_PATH.read_text(encoding="utf-8"),
        encoding="utf-8",
    )
    repository = CompanyCatalogRepository(temporary_catalog)

    temporary_catalog.unlink()

    assert repository.count(CompanyType.IMPLEMENTATION) == 230
    assert repository.list(CompanyType.IMPLEMENTATION)[-1].company_name == "Abacus"


def test_repository_rejects_missing_company_category(tmp_path: Path) -> None:
    catalog = json.loads(DEFAULT_CATALOG_PATH.read_text(encoding="utf-8"))
    catalog["companies"].pop("VENDOR")
    invalid_catalog = tmp_path / "missing-category.json"
    invalid_catalog.write_text(json.dumps(catalog), encoding="utf-8")

    with pytest.raises(CompanyCatalogError, match="Invalid company catalog"):
        CompanyCatalogRepository(invalid_catalog)


def test_repository_rejects_duplicate_company_names(tmp_path: Path) -> None:
    catalog = json.loads(DEFAULT_CATALOG_PATH.read_text(encoding="utf-8"))
    catalog["companies"]["IMPLEMENTATION"].append(
        dict(catalog["companies"]["IMPLEMENTATION"][0])
    )
    invalid_catalog = tmp_path / "duplicate-company.json"
    invalid_catalog.write_text(json.dumps(catalog), encoding="utf-8")

    with pytest.raises(
        CompanyCatalogError,
        match="Duplicate company names in IMPLEMENTATION",
    ):
        CompanyCatalogRepository(invalid_catalog)


def test_repository_reports_unreadable_catalog(tmp_path: Path) -> None:
    missing_catalog = tmp_path / "does-not-exist.json"

    with pytest.raises(CompanyCatalogError, match="Unable to read company catalog"):
        CompanyCatalogRepository(missing_catalog)
