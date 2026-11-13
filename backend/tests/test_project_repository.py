from datetime import UTC, datetime
from pathlib import Path

import pytest

from neoarchive.domain import StoryProject
from neoarchive.persistence import ProjectRepository, ProjectRevisionConflictError


def test_timed_blank_page_survives_repository_save(tmp_path: Path) -> None:
    project = make_project("空白页")
    payload = project.model_dump(mode="json")
    payload["chapters"][0]["scenes"][0]["cues"] = [
        {"id": "blank", "type": "wait", "atMs": 0, "blank": True, "durationMs": 1750}
    ]
    repository = ProjectRepository(tmp_path / "projects")
    repository.save(StoryProject.model_validate(payload))
    restored = repository.get(project.project_id).project.model_dump(mode="json")
    cue = restored["chapters"][0]["scenes"][0]["cues"][0]
    assert cue["blank"] is True
    assert cue["durationMs"] == 1750


def test_music_selection_survives_repository_save(tmp_path: Path) -> None:
    payload = make_project("音乐选区").model_dump(mode="json")
    payload["chapters"][0]["scenes"][0]["cues"] = [
        {
            "id": "music",
            "type": "audio.play",
            "atMs": 0,
            "assetRef": "music",
            "channel": "bgm",
            "loop": True,
            "startMs": 1000,
            "endMs": 2800,
        }
    ]
    repository = ProjectRepository(tmp_path / "projects")
    repository.save(StoryProject.model_validate(payload))
    restored = repository.get(payload["projectId"]).project.model_dump(mode="json")
    cue = restored["chapters"][0]["scenes"][0]["cues"][0]
    assert cue["startMs"] == 1000
    assert cue["endMs"] == 2800
    assert cue["loop"] is True


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
