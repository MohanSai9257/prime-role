"""API contract tests that run without Supabase or external credentials."""

from io import BytesIO
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

from fastapi.testclient import TestClient

from app.api.resumes import get_base_resume_storage
from app.main import app, create_app
from app.services.base_resume_storage import BaseResumeStorage
from app.services.settings_repository import InMemorySettingsRepository

client = TestClient(app)


def test_health_does_not_require_database_credentials() -> None:
    response = client.get("/api/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["mode"] == "demo"
    assert isinstance(body["database_configured"], bool)


def test_sample_jobs_have_frontend_contract_and_demo_label() -> None:
    response = client.get("/api/jobs")

    assert response.status_code == 200
    jobs = response.json()
    assert len(jobs) == 3
    assert {job["sponsorship"] for job in jobs} == {
        "Confirmed",
        "Unclear",
        "No",
    }
    required = {
        "id",
        "company_name",
        "job_title",
        "job_url",
        "location",
        "posted_at",
        "ats_score",
        "sponsorship",
        "is_demo",
    }
    assert all(set(job) == required for job in jobs)
    assert all(job["is_demo"] is True for job in jobs)


def test_demo_settings_have_useful_relative_defaults() -> None:
    settings = InMemorySettingsRepository().get()

    assert settings.base_resume_path == ""
    assert settings.company_type.value == "IMPLEMENTATION"
    assert settings.output_directory == "generated-resumes"
    assert settings.start_date.isoformat() == "2026-07-25"
    assert settings.target_roles == [
        "Software Engineer",
        "DevOps Engineer",
        "Platform Engineer",
    ]
    assert settings.persistence == "in_memory_demo"


def test_settings_can_be_replaced_and_read_back() -> None:
    payload = {
        "base_resume_path": "/documents/base.docx",
        "company_type": "IMPLEMENTATION",
        "output_directory": "/documents/tailored",
        "start_date": "2026-07-25",
        "target_roles": ["DevOps Engineer", "SRE"],
    }

    update = client.put("/api/settings", json=payload)
    assert update.status_code == 200
    assert update.json() == {**payload, "persistence": "in_memory_demo"}

    read = client.get("/api/settings")
    assert read.status_code == 200
    assert read.json() == update.json()


def test_company_summary_includes_all_types_and_spreadsheet_counts() -> None:
    response = client.get("/api/companies/summary")

    assert response.status_code == 200
    assert response.json() == [
        {
            "company_type": "DIRECT_CLIENT",
            "label": "Direct Client",
            "company_count": 0,
        },
        {
            "company_type": "IMPLEMENTATION",
            "label": "Implementation",
            "company_count": 230,
        },
        {
            "company_type": "VENDOR",
            "label": "Vendor",
            "company_count": 0,
        },
    ]


def test_company_summary_can_be_filtered_by_type() -> None:
    response = client.get(
        "/api/companies/summary",
        params={"company_type": "IMPLEMENTATION"},
    )

    assert response.status_code == 200
    assert response.json() == [
        {
            "company_type": "IMPLEMENTATION",
            "label": "Implementation",
            "company_count": 230,
        }
    ]


def test_company_catalog_can_be_listed_and_filtered() -> None:
    all_companies = client.get("/api/companies")
    implementations = client.get(
        "/api/companies",
        params={"company_type": "IMPLEMENTATION"},
    )
    vendors = client.get(
        "/api/companies",
        params={"company_type": "VENDOR"},
    )

    assert all_companies.status_code == 200
    assert implementations.status_code == 200
    assert vendors.status_code == 200
    assert len(all_companies.json()) == 230
    assert all_companies.json() == implementations.json()
    assert vendors.json() == []
    assert implementations.json()[0] == {
        "company_name": "Cognizant",
        "company_type": "IMPLEMENTATION",
        "headquarters": "Teaneck, NJ",
        "linkedin_url": "https://www.linkedin.com/company/cognizant",
        "careers_url": "https://careers.cognizant.com/",
    }


def test_company_catalog_rejects_an_unknown_type() -> None:
    response = client.get(
        "/api/companies",
        params={"company_type": "STAFFING"},
    )

    assert response.status_code == 422


def test_search_run_is_explicitly_simulated() -> None:
    response = client.post("/api/search-runs")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "completed"
    assert body["company_type"] == "IMPLEMENTATION"
    assert body["companies_checked"] == 230
    assert body["new_jobs"] == 3
    assert body["is_demo"] is True
    assert "simulated" in body["message"].lower()


def test_search_run_uses_requested_type_and_handles_empty_category() -> None:
    response = client.post(
        "/api/search-runs",
        json={"company_type": "VENDOR"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["company_type"] == "VENDOR"
    assert body["companies_checked"] == 0
    assert body["new_jobs"] == 0
    assert body["duplicates_skipped"] == 0
    assert body["is_demo"] is True
    assert "no company websites were contacted" in body["message"].lower()


def test_tailor_is_explicitly_simulated_and_does_not_create_file() -> None:
    response = client.post("/api/jobs/job-001/tailor")

    assert response.status_code == 200
    body = response.json()
    assert body["job_id"] == "job-001"
    assert body["status"] == "demo"
    assert body["previous_score"] == 76
    assert body["target_score"] == 95
    assert "No file was created" in body["message"]


def test_tailor_rejects_unknown_job() -> None:
    response = client.post("/api/jobs/missing/tailor")

    assert response.status_code == 404
    assert response.json() == {"detail": "Job not found"}


def make_minimal_docx() -> bytes:
    document = BytesIO()
    with ZipFile(document, "w", ZIP_DEFLATED) as archive:
        archive.writestr(
            "[Content_Types].xml",
            (
                '<?xml version="1.0" encoding="UTF-8"?>'
                '<Types xmlns="http://schemas.openxmlformats.org/'
                'package/2006/content-types">'
                '<Default Extension="xml" ContentType="application/xml"/>'
                "</Types>"
            ),
        )
        archive.writestr(
            "word/document.xml",
            (
                '<?xml version="1.0" encoding="UTF-8"?>'
                '<w:document xmlns:w="http://schemas.openxmlformats.org/'
                'wordprocessingml/2006/main"><w:body/></w:document>'
            ),
        )
    return document.getvalue()


def test_base_resume_upload_stays_local_and_updates_settings(
    tmp_path: Path,
) -> None:
    app.dependency_overrides[get_base_resume_storage] = lambda: BaseResumeStorage(
        tmp_path / "base-resumes"
    )
    try:
        response = client.post(
            "/api/resumes/base",
            files={
                "file": (
                    "Mohan Resume.docx",
                    make_minimal_docx(),
                    (
                        "application/vnd.openxmlformats-officedocument."
                        "wordprocessingml.document"
                    ),
                )
            },
        )
    finally:
        app.dependency_overrides.pop(get_base_resume_storage, None)

    assert response.status_code == 201
    body = response.json()
    assert body["original_filename"] == "Mohan Resume.docx"
    stored_path = Path(body["stored_path"])
    assert stored_path.is_file()
    assert stored_path.name == "Mohan Resume.docx"
    assert stored_path.is_relative_to(tmp_path)
    assert client.get("/api/settings").json()["base_resume_path"] == str(
        stored_path
    )


def test_base_resume_upload_rejects_non_docx(tmp_path: Path) -> None:
    app.dependency_overrides[get_base_resume_storage] = lambda: BaseResumeStorage(
        tmp_path
    )
    try:
        response = client.post(
            "/api/resumes/base",
            files={"file": ("resume.pdf", b"%PDF-test", "application/pdf")},
        )
    finally:
        app.dependency_overrides.pop(get_base_resume_storage, None)

    assert response.status_code == 415
    assert response.json() == {
        "detail": "Upload a Microsoft Word DOCX file."
    }


def test_base_resume_upload_rejects_invalid_docx(tmp_path: Path) -> None:
    app.dependency_overrides[get_base_resume_storage] = lambda: BaseResumeStorage(
        tmp_path
    )
    try:
        response = client.post(
            "/api/resumes/base",
            files={
                "file": (
                    "resume.docx",
                    b"not-a-zip",
                    "application/octet-stream",
                )
            },
        )
    finally:
        app.dependency_overrides.pop(get_base_resume_storage, None)

    assert response.status_code == 400
    assert "not a valid Word DOCX" in response.json()["detail"]


def test_base_resume_upload_enforces_size_limit(tmp_path: Path) -> None:
    app.dependency_overrides[get_base_resume_storage] = lambda: BaseResumeStorage(
        tmp_path,
        max_bytes=8,
    )
    try:
        response = client.post(
            "/api/resumes/base",
            files={
                "file": (
                    "resume.docx",
                    make_minimal_docx(),
                    "application/octet-stream",
                )
            },
        )
    finally:
        app.dependency_overrides.pop(get_base_resume_storage, None)

    assert response.status_code == 413
    assert "10 MB or smaller" in response.json()["detail"]


def test_api_runs_when_frontend_build_is_absent(tmp_path: Path) -> None:
    isolated_app = create_app(frontend_dist=tmp_path / "missing-dist")
    isolated_client = TestClient(isolated_app)

    assert isolated_client.get("/api/health").status_code == 200
    assert isolated_client.get("/some-frontend-route").status_code == 404


def test_compiled_frontend_is_served_without_shadowing_api(tmp_path: Path) -> None:
    frontend_dist = tmp_path / "dist"
    assets = frontend_dist / "assets"
    assets.mkdir(parents=True)
    (frontend_dist / "index.html").write_text(
        "<html><body>Prime Role</body></html>",
        encoding="utf-8",
    )
    (assets / "app.js").write_text("console.log('ready')", encoding="utf-8")

    production_app = create_app(frontend_dist=frontend_dist)
    production_client = TestClient(production_app)

    assert production_client.get("/dashboard").text == (
        "<html><body>Prime Role</body></html>"
    )
    assert production_client.get("/assets/app.js").status_code == 200
    assert production_client.get("/docs").status_code == 200
    assert production_client.get("/api/health").json()["status"] == "ok"
    assert production_client.get("/api/not-a-route").status_code == 404
