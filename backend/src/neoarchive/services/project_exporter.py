from __future__ import annotations

import hashlib
import json
import os
import tempfile
import zipfile
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from neoarchive.domain import StoryProject


@dataclass(frozen=True, slots=True)
class ExportArtifact:
    name: str
    path: Path
    size_bytes: int
    revision: str


class ProjectExporter:
    """Builds the portable player package; asset collection plugs in here later."""

    def __init__(self, exports_dir: Path) -> None:
        self._exports_dir = exports_dir
        self._exports_dir.mkdir(parents=True, exist_ok=True)

    def export(self, project: StoryProject) -> ExportArtifact:
        project_payload = project.model_dump(mode="json", by_alias=True)
        project_bytes = (
            json.dumps(project_payload, ensure_ascii=False, indent=2) + "\n"
        ).encode("utf-8")
        revision = hashlib.sha256(project_bytes).hexdigest()
        safe_id = hashlib.sha256(project.project_id.encode("utf-8")).hexdigest()[:16]
        artifact_name = f"neoarchive-{safe_id}.zip"
        artifact_path = self._exports_dir / artifact_name
        manifest = {
            "format": "neoarchive-player-package",
            "formatVersion": 1,
            "projectId": project.project_id,
            "projectRevision": revision,
            "schemaVersion": project.schema_version,
            "generatedAt": datetime.now(UTC).isoformat(),
            "entry": "project.json",
            "assets": [],
        }

        descriptor, temporary_name = tempfile.mkstemp(
            dir=self._exports_dir,
            prefix=f".{artifact_name}-",
            suffix=".tmp",
        )
        os.close(descriptor)
        temporary_path = Path(temporary_name)
        try:
            with zipfile.ZipFile(
                temporary_path,
                mode="w",
                compression=zipfile.ZIP_DEFLATED,
                compresslevel=9,
            ) as archive:
                archive.writestr("project.json", project_bytes)
                archive.writestr(
                    "manifest.json",
                    json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
                )
            os.replace(temporary_path, artifact_path)
        finally:
            temporary_path.unlink(missing_ok=True)

        return ExportArtifact(
            name=artifact_name,
            path=artifact_path,
            size_bytes=artifact_path.stat().st_size,
            revision=revision,
        )
