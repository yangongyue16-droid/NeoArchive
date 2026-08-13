from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from platformdirs import user_data_path


@dataclass(frozen=True, slots=True)
class Settings:
    data_dir: Path
    session_token: str | None = None

    @property
    def database_path(self) -> Path:
        return self.data_dir / "asset-index.db"

    @property
    def projects_dir(self) -> Path:
        return self.data_dir / "projects"

    @property
    def exports_dir(self) -> Path:
        return self.data_dir / "exports"


def load_settings() -> Settings:
    configured_data_dir = os.getenv("NEOARCHIVE_DATA_DIR")
    data_dir = (
        Path(configured_data_dir).expanduser().resolve()
        if configured_data_dir
        else user_data_path("NeoArchive", "NeoArchive")
    )
    return Settings(
        data_dir=data_dir,
        session_token=os.getenv("NEOARCHIVE_SESSION_TOKEN") or None,
    )
