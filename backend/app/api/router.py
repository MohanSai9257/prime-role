"""Top-level API router."""

from fastapi import APIRouter

from app.api import companies, health, jobs, resumes, search_runs, settings

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(companies.router)
api_router.include_router(jobs.router)
api_router.include_router(settings.router)
api_router.include_router(resumes.router)
api_router.include_router(search_runs.router)
