from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

from neoarchive import __version__
from neoarchive.api.models import (
    AssetResponse,
    HealthResponse,
    ProjectDiagnostic,
    ProjectDocumentResponse,
    ProjectExportResponse,
    ProjectSaveRequest,
    ProjectSummary,
    ProjectValidationResponse,
    ScanRequest,
    ScanResponse,
)
from neoarchive.config import Settings, load_settings
from neoarchive.domain import StoryProject
from neoarchive.persistence import (
    AssetIndexRepository,
    ProjectNotFoundError,
    ProjectRepository,
    ProjectRevisionConflictError,
)
from neoarchive.services.asset_scanner import AssetScanner
from neoarchive.services.project_exporter import ProjectExporter
from neoarchive.services.project_validator import ProjectValidator


def create_app(settings: Settings | None = None) -> FastAPI:
    active_settings = settings or load_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        active_settings.data_dir.mkdir(parents=True, exist_ok=True)
        repository = AssetIndexRepository(active_settings.database_path)
        app.state.asset_index = repository
        app.state.asset_scanner = AssetScanner(repository)
        app.state.project_repository = ProjectRepository(active_settings.projects_dir)
        app.state.project_validator = ProjectValidator()
        app.state.project_exporter = ProjectExporter(active_settings.exports_dir)
        yield
        repository.close()

    app = FastAPI(
        title="NeoArchive Local API",
        version=__version__,
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://127.0.0.1:5173",
            "http://localhost:5173",
            "http://tauri.localhost",
            "tauri://localhost",
        ],
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
    )

    @app.middleware("http")
    async def require_session_token(request: Request, call_next):  # type: ignore[no-untyped-def]
        if active_settings.session_token and request.url.path.startswith("/api/"):
            authorization = request.headers.get("authorization")
            if authorization != f"Bearer {active_settings.session_token}":
                return JSONResponse(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    content={"detail": "Invalid session token"},
                )
        return await call_next(request)

    @app.get("/api/v1/health", response_model=HealthResponse)
    def health() -> HealthResponse:
        return HealthResponse(
            status="ok",
            service="neoarchive-api",
            version=__version__,
            database="turso",
            capabilities=[
                "project-storage",
                "project-validation",
                "asset-index",
                "export-pipeline",
            ],
        )

    @app.get("/api/v1/schemas/project")
    def project_schema() -> dict[str, object]:
        return StoryProject.model_json_schema(by_alias=True)

    @app.post("/api/v1/projects/validate", response_model=ProjectValidationResponse)
    def validate_project(payload: StoryProject, request: Request) -> ProjectValidationResponse:
        validator: ProjectValidator = request.app.state.project_validator
        diagnostics = validator.validate(payload)
        return ProjectValidationResponse(
            valid=not any(item.severity == "error" for item in diagnostics),
            diagnostics=[ProjectDiagnostic.model_validate(item) for item in diagnostics],
        )

    @app.get("/api/v1/projects", response_model=list[ProjectSummary])
    def list_projects(request: Request) -> list[ProjectSummary]:
        repository: ProjectRepository = request.app.state.project_repository
        return [
            ProjectSummary(
                project_id=item.project.project_id,
                title=item.project.title,
                schema_version=item.project.schema_version,
                updated_at=item.project.updated_at.isoformat(),
                revision=item.revision,
            )
            for item in repository.list()
        ]

    @app.get("/api/v1/projects/{project_id}", response_model=ProjectDocumentResponse)
    def open_project(project_id: str, request: Request) -> ProjectDocumentResponse:
        repository: ProjectRepository = request.app.state.project_repository
        validator: ProjectValidator = request.app.state.project_validator
        try:
            stored = repository.get(project_id)
        except ProjectNotFoundError as error:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "PROJECT_NOT_FOUND", "message": "工程不存在。"},
            ) from error
        diagnostics = validator.validate(stored.project)
        return ProjectDocumentResponse(
            project=stored.project,
            revision=stored.revision,
            diagnostics=[ProjectDiagnostic.model_validate(item) for item in diagnostics],
        )

    @app.put("/api/v1/projects/{project_id}", response_model=ProjectDocumentResponse)
    def save_project(
        project_id: str,
        payload: ProjectSaveRequest,
        request: Request,
    ) -> ProjectDocumentResponse:
        if payload.project.project_id != project_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": "PROJECT_ID_MISMATCH",
                    "message": "请求路径和工程内容的 projectId 不一致。",
                },
            )

        repository: ProjectRepository = request.app.state.project_repository
        validator: ProjectValidator = request.app.state.project_validator
        diagnostics = validator.validate(payload.project)
        if any(item.severity == "error" for item in diagnostics):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail={
                    "code": "PROJECT_VALIDATION_FAILED",
                    "message": "工程包含阻止保存的错误。",
                    "diagnostics": [
                        ProjectDiagnostic.model_validate(item).model_dump(by_alias=True)
                        for item in diagnostics
                    ],
                },
            )

        try:
            stored = repository.save(payload.project, payload.revision)
        except ProjectRevisionConflictError as error:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "code": "PROJECT_REVISION_CONFLICT",
                    "message": "工程已在外部发生变化，请重新打开后再保存。",
                },
            ) from error

        return ProjectDocumentResponse(
            project=stored.project,
            revision=stored.revision,
            diagnostics=[ProjectDiagnostic.model_validate(item) for item in diagnostics],
        )

    @app.post("/api/v1/projects/{project_id}/export", response_model=ProjectExportResponse)
    def export_project(project_id: str, request: Request) -> ProjectExportResponse:
        repository: ProjectRepository = request.app.state.project_repository
        validator: ProjectValidator = request.app.state.project_validator
        exporter: ProjectExporter = request.app.state.project_exporter
        try:
            stored = repository.get(project_id)
        except ProjectNotFoundError as error:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "PROJECT_NOT_FOUND", "message": "工程不存在。"},
            ) from error

        diagnostics = validator.validate(stored.project)
        if any(item.severity == "error" for item in diagnostics):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail={
                    "code": "PROJECT_VALIDATION_FAILED",
                    "message": "工程包含阻止导出的错误。",
                },
            )

        artifact = exporter.export(stored.project)
        return ProjectExportResponse(
            project_id=project_id,
            artifact_name=artifact.name,
            path=str(artifact.path),
            size_bytes=artifact.size_bytes,
            revision=artifact.revision,
        )

    @app.get("/api/v1/assets", response_model=list[AssetResponse])
    def list_assets(
        request: Request,
        limit: int = Query(default=100, ge=1, le=500),
        offset: int = Query(default=0, ge=0),
    ) -> list[AssetResponse]:
        repository: AssetIndexRepository = request.app.state.asset_index
        assets = repository.list(limit=limit, offset=offset)
        return [AssetResponse.model_validate(asset) for asset in assets]

    @app.post("/api/v1/assets/scan", response_model=ScanResponse)
    def scan_assets(payload: ScanRequest, request: Request) -> ScanResponse:
        scanner: AssetScanner = request.app.state.asset_scanner
        root = Path(payload.root).expanduser().resolve()
        try:
            scanned, skipped = scanner.scan(root)
        except (FileNotFoundError, NotADirectoryError) as error:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(error),
            ) from error
        return ScanResponse(root=str(root), scanned=scanned, skipped=skipped)

    @app.get("/api/v1/assets/{asset_id}/content")
    def asset_content(asset_id: str, request: Request) -> FileResponse:
        repository: AssetIndexRepository = request.app.state.asset_index
        asset = repository.get(asset_id)
        if not asset:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")
        path = Path(asset.path)
        if not path.is_file():
            raise HTTPException(status_code=status.HTTP_410_GONE, detail="Indexed asset is missing")
        return FileResponse(path, media_type=asset.mime_type, filename=path.name)

    return app


app = create_app()
