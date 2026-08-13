from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import turso

from neoarchive.persistence.migration_runner import apply_migrations


@dataclass(frozen=True, slots=True)
class AssetRecord:
    id: str
    content_hash: str
    path: str
    kind: str
    mime_type: str | None
    size_bytes: int
    modified_ns: int
    width: int | None
    height: int | None
    duration_ms: int | None
    last_seen_at: str


class AssetIndexRepository:
    def __init__(self, database_path: Path) -> None:
        database_path.parent.mkdir(parents=True, exist_ok=True)
        self._connection: Any = turso.connect(str(database_path))
        apply_migrations(self._connection)

    def close(self) -> None:
        self._connection.close()

    def upsert(self, asset: AssetRecord) -> None:
        self._connection.execute(
            """
            INSERT INTO asset_index (
                id, content_hash, path, kind, mime_type, size_bytes, modified_ns,
                width, height, duration_ms, last_seen_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(path) DO UPDATE SET
                id = excluded.id,
                content_hash = excluded.content_hash,
                kind = excluded.kind,
                mime_type = excluded.mime_type,
                size_bytes = excluded.size_bytes,
                modified_ns = excluded.modified_ns,
                width = excluded.width,
                height = excluded.height,
                duration_ms = excluded.duration_ms,
                last_seen_at = excluded.last_seen_at
            """,
            (
                asset.id,
                asset.content_hash,
                asset.path,
                asset.kind,
                asset.mime_type,
                asset.size_bytes,
                asset.modified_ns,
                asset.width,
                asset.height,
                asset.duration_ms,
                asset.last_seen_at,
            ),
        )
        self._connection.commit()

    def list(self, *, limit: int = 100, offset: int = 0) -> list[AssetRecord]:
        rows = self._connection.execute(
            """
            SELECT id, content_hash, path, kind, mime_type, size_bytes, modified_ns,
                   width, height, duration_ms, last_seen_at
            FROM asset_index
            ORDER BY path
            LIMIT ? OFFSET ?
            """,
            (limit, offset),
        ).fetchall()
        return [AssetRecord(*row) for row in rows]

    def get(self, asset_id: str) -> AssetRecord | None:
        row = self._connection.execute(
            """
            SELECT id, content_hash, path, kind, mime_type, size_bytes, modified_ns,
                   width, height, duration_ms, last_seen_at
            FROM asset_index
            WHERE id = ?
            """,
            (asset_id,),
        ).fetchone()
        return AssetRecord(*row) if row else None
