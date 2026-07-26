"""Demo job-search orchestration route."""

from uuid import uuid4

from fastapi import APIRouter

from app.schemas import SearchRunRequest, SearchRunResponse
from app.services.company_catalog_repository import company_catalog_repository
from app.services.settings_repository import settings_repository

router = APIRouter(prefix="/search-runs", tags=["search runs"])


@router.post("", response_model=SearchRunResponse)
def create_search_run(
    request: SearchRunRequest | None = None,
) -> SearchRunResponse:
    """Return a deterministic demo result without crawling external sites."""

    selected_type = (
        request.company_type
        if request and request.company_type
        else settings_repository.get().company_type
    )
    companies_checked = company_catalog_repository.count(selected_type)
    new_jobs = 3 if companies_checked else 0

    return SearchRunResponse(
        id=f"demo-{uuid4()}",
        company_type=selected_type,
        companies_checked=companies_checked,
        new_jobs=new_jobs,
        duplicates_skipped=7 if companies_checked else 0,
        message=(
            f"Demo only: search of {companies_checked} built-in "
            f"{selected_type.label} companies was simulated; no company "
            "websites were contacted."
        ),
    )
