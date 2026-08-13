from pathlib import Path

from fastapi.testclient import TestClient

from neoarchive.config import Settings
from neoarchive.main import create_app


def project_payload(*, title: str = "测试工程") -> dict[str, object]:
    return {
        "schemaVersion": 1,
        "projectId": "project-test",
        "title": title,
        "entrySceneId": "scene-01",
        "createdAt": "2026-08-13T00:00:00Z",
        "updatedAt": "2026-08-13T00:00:00Z",
        "chapters": [
            {
                "id": "chapter-01",
                "title": "第一章",
                "scenes": [
                    {
                        "id": "scene-01",
                        "title": "开场",
                        "kind": "dialogue",
                        "cues": [
                            {
                                "id": "cue-01",
                                "type": "dialogue.show",
                                "atMs": 0,
                                "speaker": "老师",
                                "text": "开始。",
                                "typingCps": 36,
                                "waitForAdvance": True,
                            }
                        ],
                    }
                ],
            }
        ],
    }


def test_health_reports_turso(tmp_path: Path) -> None:
    app = create_app(Settings(data_dir=tmp_path))

    with TestClient(app) as client:
        response = client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json()["database"] == "turso"
    assert "project-storage" in response.json()["capabilities"]


def test_scans_and_lists_supported_assets(tmp_path: Path) -> None:
    library = tmp_path / "library"
    library.mkdir()
    (library / "background.png").write_bytes(b"not-a-real-png")
    app = create_app(Settings(data_dir=tmp_path / "data"))

    with TestClient(app) as client:
        scan_response = client.post("/api/v1/assets/scan", json={"root": str(library)})
        list_response = client.get("/api/v1/assets")

    assert scan_response.status_code == 200
    assert scan_response.json()["scanned"] == 1
    assert list_response.status_code == 200
    assert list_response.json()[0]["path"].endswith("background.png")


def test_project_schema_uses_camel_case(tmp_path: Path) -> None:
    app = create_app(Settings(data_dir=tmp_path))

    with TestClient(app) as client:
        response = client.get("/api/v1/schemas/project")

    assert response.status_code == 200
    assert "schemaVersion" in response.json()["properties"]


def test_session_token_protects_local_api(tmp_path: Path) -> None:
    app = create_app(Settings(data_dir=tmp_path, session_token="secret"))

    with TestClient(app) as client:
        unauthorized = client.get("/api/v1/health")
        authorized = client.get(
            "/api/v1/health",
            headers={"Authorization": "Bearer secret"},
        )

    assert unauthorized.status_code == 401
    assert authorized.status_code == 200


def test_saves_lists_and_opens_project(tmp_path: Path) -> None:
    app = create_app(Settings(data_dir=tmp_path))

    with TestClient(app) as client:
        saved = client.put(
            "/api/v1/projects/project-test",
            json={"project": project_payload()},
        )
        listed = client.get("/api/v1/projects")
        opened = client.get("/api/v1/projects/project-test")

    assert saved.status_code == 200
    assert saved.json()["revision"]
    assert listed.json()[0]["title"] == "测试工程"
    assert opened.json()["project"]["projectId"] == "project-test"


def test_rejects_stale_project_revision(tmp_path: Path) -> None:
    app = create_app(Settings(data_dir=tmp_path))

    with TestClient(app) as client:
        saved = client.put(
            "/api/v1/projects/project-test",
            json={"project": project_payload()},
        ).json()
        updated = client.put(
            "/api/v1/projects/project-test",
            json={"project": project_payload(title="外部更新"), "revision": saved["revision"]},
        )
        conflict = client.put(
            "/api/v1/projects/project-test",
            json={"project": project_payload(title="过期更新"), "revision": saved["revision"]},
        )

    assert updated.status_code == 200
    assert conflict.status_code == 409
    assert conflict.json()["detail"]["code"] == "PROJECT_REVISION_CONFLICT"


def test_reports_broken_scene_reference(tmp_path: Path) -> None:
    payload = project_payload()
    chapters = payload["chapters"]
    assert isinstance(chapters, list)
    chapter = chapters[0]
    assert isinstance(chapter, dict)
    scenes = chapter["scenes"]
    assert isinstance(scenes, list)
    scene = scenes[0]
    assert isinstance(scene, dict)
    scene["nextSceneId"] = "scene-missing"
    app = create_app(Settings(data_dir=tmp_path))

    with TestClient(app) as client:
        response = client.post("/api/v1/projects/validate", json=payload)

    assert response.status_code == 200
    assert response.json()["valid"] is False
    assert response.json()["diagnostics"][0]["code"] == "NEXT_SCENE_NOT_FOUND"


def test_exports_saved_project_package(tmp_path: Path) -> None:
    app = create_app(Settings(data_dir=tmp_path))

    with TestClient(app) as client:
        client.put(
            "/api/v1/projects/project-test",
            json={"project": project_payload()},
        )
        response = client.post("/api/v1/projects/project-test/export")

    assert response.status_code == 200
    artifact_path = Path(response.json()["path"])
    assert artifact_path.is_file()
    assert artifact_path.suffix == ".zip"
