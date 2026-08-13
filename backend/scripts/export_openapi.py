from __future__ import annotations

import json
from pathlib import Path

from neoarchive.main import app


def main() -> None:
    output_path = Path(__file__).parents[2] / "schemas" / "openapi.json"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(app.openapi(), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(output_path)


if __name__ == "__main__":
    main()
