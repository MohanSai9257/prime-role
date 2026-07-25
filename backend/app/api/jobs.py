"""Job listing and demo resume-tailoring routes."""

from pathlib import Path

from fastapi import APIRouter, HTTPException, status

from app.schemas import JobResponse, TailorResumeResponse
from app.services.job_repository import job_repository
from app.services.settings_repository import settings_repository

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.get("", response_model=list[JobResponse])
def list_jobs() -> list[JobResponse]:
    """Return sample jobs for the first frontend integration."""

    return job_repository.list()


@router.post(
    "/{job_id}/tailor",
    response_model=TailorResumeResponse,
    status_code=status.HTTP_200_OK,
)
def tailor_resume(job_id: str) -> TailorResumeResponse:
    """Simulate tailoring; no resume file is created in this demo."""

    job = job_repository.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")

    configured_output = settings_repository.get().output_directory
    output_path = Path(configured_output or "generated-resumes")
    output_path = output_path / "Current_Tailored_Resume.docx"

    return TailorResumeResponse(
        job_id=job.id,
        output_path=str(output_path),
        previous_score=job.ats_score,
        message=(
            "Demo only: resume tailoring was simulated. No file was created or "
            "overwritten."
        ),
    )
