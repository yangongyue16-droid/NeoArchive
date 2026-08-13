CREATE TABLE IF NOT EXISTS asset_index (
    id TEXT PRIMARY KEY,
    content_hash TEXT NOT NULL,
    path TEXT NOT NULL UNIQUE,
    kind TEXT NOT NULL,
    mime_type TEXT,
    size_bytes INTEGER NOT NULL,
    modified_ns INTEGER NOT NULL,
    width INTEGER,
    height INTEGER,
    duration_ms INTEGER,
    last_seen_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_asset_index_content_hash
ON asset_index(content_hash);

CREATE INDEX IF NOT EXISTS idx_asset_index_kind
ON asset_index(kind);
