from __future__ import annotations

import hashlib
import json
import mimetypes
from datetime import UTC, datetime
from pathlib import Path
from uuid import NAMESPACE_URL, uuid5

from PIL import Image, UnidentifiedImageError

from neoarchive.persistence import AssetIndexRepository, AssetRecord

SUPPORTED_SUFFIXES = {
    ".atlas",
    ".gif",
    ".jpeg",
    ".jpg",
    ".mp3",
    ".ogg",
    ".png",
    ".skel",
    ".svg",
    ".wav",
    ".webp",
}


def _hash_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _image_size(path: Path) -> tuple[int | None, int | None]:
    try:
        with Image.open(path) as image:
            return image.size
    except (UnidentifiedImageError, OSError):
        return None, None


def _asset_kind(path: Path) -> str:
    if path.suffix.lower() in {".gif", ".jpeg", ".jpg", ".png", ".svg", ".webp"}:
        return "image"
    if path.suffix.lower() in {".mp3", ".ogg", ".wav"}:
        return "audio"
    if path.suffix.lower() in {".atlas", ".skel"}:
        return "spine"
    return "unknown"


def _catalog_metadata(root: Path) -> dict[str, dict[str, str]]:
    """Read optional authoring metadata without treating the manifest as asset content."""
    manifest_path = root / "catalog.json"
    if not manifest_path.is_file():
        return {}
    try:
        payload = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}

    metadata: dict[str, dict[str, str]] = {}
    if not isinstance(payload, dict):
        return metadata
    for collection, category in (
        ("backgrounds", "background"),
        ("characters", "character"),
        ("audio", "audio"),
    ):
        entries = payload.get(collection)
        if not isinstance(entries, list):
            continue
        for entry in entries:
            if not isinstance(entry, dict):
                continue
            path = entry.get("path")
            asset_ref = entry.get("id")
            if not isinstance(path, str) or not isinstance(asset_ref, str):
                continue
            row = {
                "asset_ref": asset_ref,
                "display_name": entry.get("label")
                if isinstance(entry.get("label"), str)
                else asset_ref,
                "category": category,
            }
            preview = entry.get("preview")
            if isinstance(preview, str):
                row["preview_relative_path"] = preview
            metadata[Path(path).as_posix()] = row
    return metadata


class AssetScanner:
    def __init__(self, repository: AssetIndexRepository) -> None:
        self._repository = repository

    def scan(self, root: Path, *, library_id: str = "default") -> tuple[int, int]:
        resolved_root = root.expanduser().resolve(strict=True)
        if not resolved_root.is_dir():
            raise NotADirectoryError(resolved_root)

        metadata = _catalog_metadata(resolved_root)
        scanned = 0
        skipped = 0
        for path in resolved_root.rglob("*"):
            if not path.is_file() or path.suffix.lower() not in SUPPORTED_SUFFIXES:
                skipped += int(path.is_file())
                continue
            stat = path.stat()
            width, height = _image_size(path)
            resolved_path = path.resolve(strict=True)
            relative_path = resolved_path.relative_to(resolved_root).as_posix()
            manifest = metadata.get(relative_path, {})
            record = AssetRecord(
                id=str(uuid5(NAMESPACE_URL, resolved_path.as_uri())),
                library_id=library_id,
                relative_path=relative_path,
                asset_ref=manifest.get("asset_ref"),
                display_name=manifest.get("display_name"),
                category=manifest.get("category"),
                preview_relative_path=manifest.get("preview_relative_path"),
                content_hash=_hash_file(resolved_path),
                path=str(resolved_path),
                kind=_asset_kind(resolved_path),
                mime_type=mimetypes.guess_type(resolved_path.name)[0],
                size_bytes=stat.st_size,
                modified_ns=stat.st_mtime_ns,
                width=width,
                height=height,
                duration_ms=None,
                last_seen_at=datetime.now(UTC).isoformat(),
            )
            self._repository.upsert(record)
            scanned += 1
        return scanned, skipped
