from datetime import UTC, datetime
from pathlib import Path

import pytest

from neoarchive.domain import StoryProject
from neoarchive.persistence import ProjectRepository, ProjectRevisionConflictError


def make_project(title: str) -> StoryProject:
    return StoryProject.model_validate(
        {
            "schemaVersion": 1,
            "projectId": "../../still-safe",
            "title": title,
            "entrySceneId": "scene-01",
            "createdAt": datetime.now(UTC),
            "updatedAt": datetime.now(UTC),
            "chapters": [
                {
                    "id": "chapter-01",
                    "title": "第一章",
                    "scenes": [
                        {
                            "id": "scene-01",
                            "title": "开场",
                            "kind": "dialogue",
                            "cues": [],
                        }
                    ],
                }
            ],
        }
    )


def test_project_repository_round_trip_and_revision_conflict(tmp_path: Path) -> None:
    repository = ProjectRepository(tmp_path / "projects")
    first = repository.save(make_project("第一版"))

    with pytest.raises(ProjectRevisionConflictError):
        repository.save(make_project("缺少 revision"))

    second = repository.save(make_project("第二版"), first.revision)

    assert repository.get("../../still-safe").project.title == "第二版"
    assert len(repository.list()) == 1
    assert list((tmp_path / "projects").glob("*.neoarchive.json"))

    with pytest.raises(ProjectRevisionConflictError):
        repository.save(make_project("过期版本"), first.revision)

    assert second.revision != first.revision
