"""Demo job-search orchestration route."""

from uuid import uuid4

from fastapi import APIRouter

from app.schemas import SearchRunRequest, SearchRunResponse

router = APIRouter(prefix="/search-runs", tags=["search runs"])


@router.post("", response_model=SearchRunResponse)
def create_search_run(_: SearchRunRequest | None = None) -> SearchRunResponse:
    """Return a deterministic demo result without crawling external sites."""

    return SearchRunResponse(
        id=f"demo-{uuid4()}",
        duplicates_skipped=7,
        message=(
            "Demo only: the 250-company search was simulated; no company "
            "websites were contacted."
        ),
    )
