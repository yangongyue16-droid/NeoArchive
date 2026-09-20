import json
import zipfile
from pathlib import Path

import pytest
from pydantic import ValidationError
from test_project_repository import make_project

from neoarchive.domain.project import BackgroundSetCue
from neoarchive.persistence import ProjectRepository
from neoarchive.services.project_exporter import ProjectExporter


@pytest.mark.parametrize("kind", ["glitch", "vhs", "droplets", "frost", "shatter"])
@pytest.mark.parametrize("cover_dialogue", [False, True])
def test_effect_survives_save_open_and_export(
    tmp_path: Path, kind: str, cover_dialogue: bool
) -> None:
    cue = BackgroundSetCue.model_validate(
        {
            "id": "background",
            "atMs": 0,
            "type": "background.set",
            "assetRef": "",
            "effect": {
                "kind": kind,
                "intensity": 1.25,
                "speed": 0.5,
                "coverDialogue": cover_dialogue,
            },
        }
    )
    project = make_project("背景特效")
    project.chapters[0].scenes[0].cues.append(cue)
    repository = ProjectRepository(tmp_path / "projects")
    repository.save(project)
    restored = repository.get(project.project_id).project
    artifact = ProjectExporter(tmp_path / "exports").export(restored)
    with zipfile.ZipFile(artifact.path) as archive:
        exported = json.loads(archive.read("project.json"))
    assert exported["chapters"][0]["scenes"][0]["cues"][0]["effect"] == {
        "kind": kind,
        "coverDialogue": cover_dialogue,
        "intensity": 1.25,
        "speed": 0.5,
    }


@pytest.mark.parametrize(
    "effect",
    [
        {"kind": "unknown"},
        {"kind": "glitch", "intensity": 3},
        {"kind": "vhs", "speed": 0},
        {"kind": "frost", "speed": float("inf")},
    ],
)
def test_rejects_invalid_effects(effect: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        BackgroundSetCue.model_validate(
            {
                "id": "background",
                "atMs": 0,
                "type": "background.set",
                "assetRef": "",
                "effect": effect,
            }
        )


@pytest.mark.parametrize("kind", ["glow", "glitch", "dissolve"])
def test_character_effect_round_trip(tmp_path: Path, kind: str) -> None:
    from neoarchive.domain.project import CharacterEnterCue

    project = make_project("角色特效")
    project.chapters[0].scenes[0].cues.append(
        CharacterEnterCue.model_validate(
            {
                "id": "actor",
                "type": "character.enter",
                "atMs": 0,
                "characterRef": "character/sakurako-idol",
                "animation": "Idle_01",
                "transform": {"x": 0.5, "y": 0.8, "scale": 1},
                "characterEffect": {
                    "kind": kind,
                    "intensity": 0.75,
                    "speed": 2,
                    "color": "#ff8844",
                    "halo": {"mode": "custom", "color": "#ffaa22", "intensity": 0.4, "speed": 0.5},
                    "haloMask": {"assetRef": "user:test-mask", "invert": True},
                },
            }
        )
    )
    repository = ProjectRepository(tmp_path / "projects")
    repository.save(project)
    restored = repository.get(project.project_id).project
    artifact = ProjectExporter(tmp_path / "exports").export(restored)
    with zipfile.ZipFile(artifact.path) as archive:
        exported = json.loads(archive.read("project.json"))
    assert exported["chapters"][0]["scenes"][0]["cues"][0]["characterEffect"] == {
        "kind": kind,
        "color": "#ff8844",
        "halo": {"mode": "custom", "color": "#ffaa22", "intensity": 0.4, "speed": 0.5},
        "haloMask": {"assetRef": "user:test-mask", "invert": True},
        "intensity": 0.75,
        "speed": 2,
    }
