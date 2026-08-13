from __future__ import annotations

import hashlib
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


class AssetScanner:
    def __init__(self, repository: AssetIndexRepository) -> None:
        self._repository = repository

    def scan(self, root: Path) -> tuple[int, int]:
        resolved_root = root.expanduser().resolve(strict=True)
        if not resolved_root.is_dir():
            raise NotADirectoryError(resolved_root)

        scanned = 0
        skipped = 0
        for path in resolved_root.rglob("*"):
            if not path.is_file() or path.suffix.lower() not in SUPPORTED_SUFFIXES:
                skipped += int(path.is_file())
                continue
            stat = path.stat()
            width, height = _image_size(path)
            resolved_path = path.resolve(strict=True)
            record = AssetRecord(
                id=str(uuid5(NAMESPACE_URL, resolved_path.as_uri())),
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
