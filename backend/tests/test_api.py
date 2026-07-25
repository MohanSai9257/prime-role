"""API contract tests that run without Supabase or external credentials."""

from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app, create_app
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

    assert settings.base_resume_path == "data/Mohan_Resume.docx"
    assert settings.company_file_path == "data/target-companies.xlsx"
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
        "company_file_path": "/documents/companies.xlsx",
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


def test_search_run_is_explicitly_simulated() -> None:
    response = client.post("/api/search-runs")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "completed"
    assert body["companies_checked"] == 250
    assert body["new_jobs"] == 3
    assert body["is_demo"] is True
    assert "simulated" in body["message"].lower()


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
