ALTER TABLE asset_index ADD COLUMN library_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE asset_index ADD COLUMN relative_path TEXT NOT NULL DEFAULT '';
ALTER TABLE asset_index ADD COLUMN asset_ref TEXT;
ALTER TABLE asset_index ADD COLUMN display_name TEXT;
ALTER TABLE asset_index ADD COLUMN category TEXT;
ALTER TABLE asset_index ADD COLUMN preview_relative_path TEXT;

CREATE INDEX IF NOT EXISTS idx_asset_index_library_kind
ON asset_index(library_id, kind);

CREATE INDEX IF NOT EXISTS idx_asset_index_library_category
ON asset_index(library_id, category);

CREATE INDEX IF NOT EXISTS idx_asset_index_library_reference
ON asset_index(library_id, asset_ref);
