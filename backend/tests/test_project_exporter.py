import json
import zipfile
from pathlib import Path

from test_project_repository import make_project

from neoarchive.services.project_exporter import ProjectExporter


def test_exporter_writes_project_and_manifest(tmp_path: Path) -> None:
    artifact = ProjectExporter(tmp_path).export(make_project("可播放包"))

    with zipfile.ZipFile(artifact.path) as archive:
        assert set(archive.namelist()) == {"manifest.json", "project.json"}
        manifest = json.loads(archive.read("manifest.json"))
        project = json.loads(archive.read("project.json"))

    assert manifest["format"] == "neoarchive-player-package"
    assert manifest["projectRevision"] == artifact.revision
    assert project["title"] == "可播放包"
