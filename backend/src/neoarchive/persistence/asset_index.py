from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import turso

from neoarchive.persistence.migration_runner import apply_migrations


@dataclass(frozen=True, slots=True)
class AssetRecord:
    id: str
    library_id: str
    relative_path: str
    asset_ref: str | None
    display_name: str | None
    category: str | None
    preview_relative_path: str | None
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
                width, height, duration_ms, last_seen_at, library_id, relative_path,
                asset_ref, display_name, category, preview_relative_path
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(path) DO UPDATE SET
                id = excluded.id,
                library_id = excluded.library_id,
                relative_path = excluded.relative_path,
                asset_ref = excluded.asset_ref,
                display_name = excluded.display_name,
                category = excluded.category,
                preview_relative_path = excluded.preview_relative_path,
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
                asset.library_id,
                asset.relative_path,
                asset.asset_ref,
                asset.display_name,
                asset.category,
                asset.preview_relative_path,
            ),
        )
        self._connection.commit()

    def list(
        self,
        *,
        library_id: str | None = None,
        kind: str | None = None,
        query: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[AssetRecord]:
        filters: list[str] = []
        params: list[object] = []
        if library_id:
            filters.append("library_id = ?")
            params.append(library_id)
        if kind:
            filters.append("kind = ?")
            params.append(kind)
        if query:
            filters.append(
                "(lower(relative_path) LIKE ? OR lower(coalesce(asset_ref, '')) LIKE ? "
                "OR lower(coalesce(display_name, '')) LIKE ?)"
            )
            wildcard = f"%{query.lower()}%"
            params.extend([wildcard, wildcard, wildcard])
        where = f"WHERE {' AND '.join(filters)}" if filters else ""
        rows = self._connection.execute(
            f"""
            SELECT id, library_id, relative_path, asset_ref, display_name, category,
                   preview_relative_path, content_hash, path, kind, mime_type, size_bytes,
                   modified_ns, width, height, duration_ms, last_seen_at
            FROM asset_index
            {where}
            ORDER BY relative_path
            LIMIT ? OFFSET ?
            """,
            (*params, limit, offset),
        ).fetchall()
        return [AssetRecord(*row) for row in rows]

    def catalog(self, library_id: str) -> list[AssetRecord]:
        rows = self._connection.execute(
            """
            SELECT id, library_id, relative_path, asset_ref, display_name, category,
                   preview_relative_path, content_hash, path, kind, mime_type, size_bytes,
                   modified_ns, width, height, duration_ms, last_seen_at
            FROM asset_index
            WHERE library_id = ? AND asset_ref IS NOT NULL AND category IS NOT NULL
            ORDER BY category, display_name, relative_path
            """,
            (library_id,),
        ).fetchall()
        return [AssetRecord(*row) for row in rows]

    def find_by_relative_path(self, library_id: str, relative_path: str) -> AssetRecord | None:
        row = self._connection.execute(
            """
            SELECT id, library_id, relative_path, asset_ref, display_name, category,
                   preview_relative_path, content_hash, path, kind, mime_type, size_bytes,
                   modified_ns, width, height, duration_ms, last_seen_at
            FROM asset_index
            WHERE library_id = ? AND relative_path = ?
            """,
            (library_id, relative_path),
        ).fetchone()
        return AssetRecord(*row) if row else None

    def get(self, asset_id: str) -> AssetRecord | None:
        row = self._connection.execute(
            """
            SELECT id, library_id, relative_path, asset_ref, display_name, category,
                   preview_relative_path, content_hash, path, kind, mime_type, size_bytes,
                   modified_ns, width, height, duration_ms, last_seen_at
            FROM asset_index
            WHERE id = ?
            """,
            (asset_id,),
        ).fetchone()
        return AssetRecord(*row) if row else None
