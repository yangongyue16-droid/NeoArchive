from __future__ import annotations

from importlib.resources import files
from typing import Any


def apply_migrations(connection: Any) -> None:
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS _schema_migrations (
            version TEXT PRIMARY KEY,
            applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    applied = {
        row[0]
        for row in connection.execute("SELECT version FROM _schema_migrations").fetchall()
    }
    migrations = files("neoarchive.persistence.migrations")
    for migration in sorted(migrations.iterdir(), key=lambda item: item.name):
        if not migration.name.endswith(".sql") or migration.name in applied:
            continue
        statements = [statement.strip() for statement in migration.read_text().split(";")]
        try:
            for statement in statements:
                if statement:
                    connection.execute(statement)
            connection.execute(
                "INSERT INTO _schema_migrations(version) VALUES (?)",
                (migration.name,),
            )
            connection.commit()
        except Exception:
            connection.rollback()
            raise
