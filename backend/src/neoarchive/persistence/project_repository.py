from __future__ import annotations

import hashlib
import json
import os
import tempfile
from dataclasses import dataclass
from pathlib import Path
from threading import RLock

from neoarchive.domain import StoryProject


class ProjectNotFoundError(FileNotFoundError):
    pass


class ProjectRevisionConflictError(RuntimeError):
    pass


@dataclass(frozen=True, slots=True)
class StoredProject:
    project: StoryProject
    revision: str


class ProjectRepository:
    """Filesystem-backed source of truth for portable NeoArchive projects."""

    def __init__(self, projects_dir: Path) -> None:
        self._projects_dir = projects_dir
        self._projects_dir.mkdir(parents=True, exist_ok=True)
        self._lock = RLock()

    @staticmethod
    def _revision(contents: bytes) -> str:
        return hashlib.sha256(contents).hexdigest()

    @staticmethod
    def _file_name(project_id: str) -> str:
        # Project ids are user-controlled. Hashing keeps every lookup inside the
        # authorized projects directory without weakening the public id format.
        digest = hashlib.sha256(project_id.encode("utf-8")).hexdigest()
        return f"{digest}.neoarchive.json"

    def _path_for(self, project_id: str) -> Path:
        return self._projects_dir / self._file_name(project_id)

    @staticmethod
    def _serialize(project: StoryProject) -> bytes:
        payload = project.model_dump(mode="json", by_alias=True)
        return (json.dumps(payload, ensure_ascii=False, indent=2) + "\n").encode("utf-8")

    def save(self, project: StoryProject, expected_revision: str | None = None) -> StoredProject:
        path = self._path_for(project.project_id)
        contents = self._serialize(project)
        revision = self._revision(contents)

        with self._lock:
            if path.exists():
                current_revision = self._revision(path.read_bytes())
                if expected_revision is None or current_revision != expected_revision:
                    raise ProjectRevisionConflictError(project.project_id)

            descriptor, temporary_name = tempfile.mkstemp(
                dir=self._projects_dir,
                prefix=f".{path.stem}-",
                suffix=".tmp",
            )
            temporary_path = Path(temporary_name)
            try:
                with os.fdopen(descriptor, "wb") as target:
                    target.write(contents)
                    target.flush()
                    os.fsync(target.fileno())
                os.replace(temporary_path, path)
            finally:
                temporary_path.unlink(missing_ok=True)

        return StoredProject(project=project, revision=revision)

    def get(self, project_id: str) -> StoredProject:
        path = self._path_for(project_id)
        with self._lock:
            if not path.is_file():
                raise ProjectNotFoundError(project_id)
            contents = path.read_bytes()
        project = StoryProject.model_validate_json(contents)
        if project.project_id != project_id:
            raise ProjectNotFoundError(project_id)
        return StoredProject(project=project, revision=self._revision(contents))

    def list(self) -> list[StoredProject]:
        projects: list[StoredProject] = []
        with self._lock:
            paths = list(self._projects_dir.glob("*.neoarchive.json"))
            for path in paths:
                contents = path.read_bytes()
                try:
                    project = StoryProject.model_validate_json(contents)
                except ValueError:
                    continue
                projects.append(
                    StoredProject(project=project, revision=self._revision(contents))
                )
        return sorted(projects, key=lambda item: item.project.updated_at, reverse=True)
