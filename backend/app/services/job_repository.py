"""Credential-free sample jobs used by the first vertical slice."""

from app.schemas import JobResponse


class SampleJobRepository:
    """Read-only demo repository.

    Replacing this class with an ATS collector or SQLAlchemy repository does not
    change the API contract consumed by the frontend.
    """

    def __init__(self) -> None:
        self._jobs = (
            JobResponse(
                id="job-001",
                company_name="Northstar Cloud",
                job_title="Senior DevOps Engineer",
                job_url="https://example.com/jobs/job-001",
                location="Chicago, IL (Hybrid)",
                posted_at="2026-07-25",
                ats_score=76,
                sponsorship="Confirmed",
            ),
            JobResponse(
                id="job-002",
                company_name="Atlas Systems",
                job_title="Cloud Platform Engineer",
                job_url="https://example.com/jobs/job-002",
                location="Remote — United States",
                posted_at="2026-07-24",
                ats_score=71,
                sponsorship="Unclear",
            ),
            JobResponse(
                id="job-003",
                company_name="Riverbank Technologies",
                job_title="Site Reliability Engineer",
                job_url="https://example.com/jobs/job-003",
                location="Dallas, TX",
                posted_at=None,
                ats_score=60,
                sponsorship="No",
            ),
        )

    def list(self) -> list[JobResponse]:
        return list(self._jobs)

    def get(self, job_id: str) -> JobResponse | None:
        return next((job for job in self._jobs if job.id == job_id), None)


job_repository = SampleJobRepository()
