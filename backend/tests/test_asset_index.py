from datetime import UTC, datetime
from pathlib import Path

from neoarchive.persistence import AssetIndexRepository, AssetRecord


def test_asset_index_round_trip(tmp_path: Path) -> None:
    repository = AssetIndexRepository(tmp_path / "asset-index.db")
    asset = AssetRecord(
        id="asset-001",
        library_id="test-library",
        relative_path="background.jpg",
        asset_ref="background/test",
        display_name="测试背景",
        category="background",
        preview_relative_path=None,
        content_hash="abc123",
        path=str(tmp_path / "background.jpg"),
        kind="image",
        mime_type="image/jpeg",
        size_bytes=42,
        modified_ns=1,
        width=1280,
        height=900,
        duration_ms=None,
        last_seen_at=datetime.now(UTC).isoformat(),
    )

    repository.upsert(asset)
    result = repository.get(asset.id)
    repository.close()

    assert result == asset
