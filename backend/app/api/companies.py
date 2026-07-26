"""Read-only routes for the built-in company catalog."""

from fastapi import APIRouter

from app.schemas import CompanyResponse, CompanySummaryResponse, CompanyType
from app.services.company_catalog_repository import company_catalog_repository

router = APIRouter(prefix="/companies", tags=["companies"])


@router.get("", response_model=list[CompanyResponse])
def list_companies(
    company_type: CompanyType | None = None,
) -> list[CompanyResponse]:
    """List bundled companies, optionally filtered by company type."""

    return company_catalog_repository.list(company_type)


@router.get("/summary", response_model=list[CompanySummaryResponse])
def summarize_companies(
    company_type: CompanyType | None = None,
) -> list[CompanySummaryResponse]:
    """Return counts for all company types or one requested type."""

    return company_catalog_repository.summary(company_type)
