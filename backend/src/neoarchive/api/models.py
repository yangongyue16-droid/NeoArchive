from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from neoarchive.domain import StoryProject


def to_camel(value: str) -> str:
    head, *tail = value.split("_")
    return head + "".join(part.capitalize() for part in tail)


class ApiModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        serialize_by_alias=True,
        from_attributes=True,
    )


class HealthResponse(ApiModel):
    status: str
    service: str
    version: str
    database: str
    capabilities: list[str]


class ScanRequest(ApiModel):
    root: str = Field(min_length=1)


class ScanResponse(ApiModel):
    root: str
    scanned: int
    skipped: int


class AssetResponse(ApiModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        serialize_by_alias=True,
        from_attributes=True,
    )

    id: str
    content_hash: str
    path: str
    kind: str
    mime_type: str | None
    size_bytes: int
    modified_ns: int
    width: int | None
    height: int | None
    duration_ms: int | None
    last_seen_at: str


class ProjectDiagnostic(ApiModel):
    severity: Literal["error", "warning"]
    code: str
    message: str
    pointer: str


class ProjectValidationResponse(ApiModel):
    valid: bool
    diagnostics: list[ProjectDiagnostic]


class ProjectSummary(ApiModel):
    project_id: str
    title: str
    schema_version: int
    updated_at: str
    revision: str


class ProjectSaveRequest(ApiModel):
    project: StoryProject
    revision: str | None = None


class ProjectDocumentResponse(ApiModel):
    project: StoryProject
    revision: str
    diagnostics: list[ProjectDiagnostic]


class ProjectExportResponse(ApiModel):
    project_id: str
    artifact_name: str
    path: str
    size_bytes: int
    revision: str
