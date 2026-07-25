"""FastAPI application entry point."""

from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api.router import api_router
from app.config import get_settings

DEFAULT_FRONTEND_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"


def add_frontend_routes(application: FastAPI, frontend_dist: Path) -> None:
    """Serve a compiled React app when its build directory exists."""

    if not frontend_dist.is_dir():
        return

    resolved_dist = frontend_dist.resolve()
    index_file = resolved_dist / "index.html"
    assets_directory = resolved_dist / "assets"

    if assets_directory.is_dir():
        application.mount(
            "/assets",
            StaticFiles(directory=assets_directory),
            name="frontend-assets",
        )

    @application.get("/{full_path:path}", include_in_schema=False)
    def serve_frontend(full_path: str) -> FileResponse:
        """Return a static file or the SPA entrypoint for frontend routes."""

        if (
            full_path in {"api", "docs", "redoc", "openapi.json"}
            or full_path.startswith(("api/", "docs/", "redoc/"))
        ):
            raise HTTPException(status_code=404, detail="Not found")

        requested_file = (resolved_dist / full_path).resolve()
        if requested_file.is_relative_to(resolved_dist) and requested_file.is_file():
            return FileResponse(requested_file)
        if index_file.is_file():
            return FileResponse(index_file)
        raise HTTPException(status_code=404, detail="Frontend build not found")


def create_app(frontend_dist: Path | None = None) -> FastAPI:
    settings = get_settings()
    application = FastAPI(
        title=settings.app_name,
        version="0.1.0",
        description=(
            "First runnable Prime Role vertical slice. Job search and resume "
            "tailoring endpoints are explicitly simulated."
        ),
    )
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    application.include_router(api_router, prefix=settings.api_prefix)
    add_frontend_routes(
        application,
        frontend_dist if frontend_dist is not None else DEFAULT_FRONTEND_DIST,
    )
    return application


app = create_app()
