from __future__ import annotations

import argparse
import json
import os

import uvicorn


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the NeoArchive local API")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", default=8765, type=int)
    parser.add_argument("--session-token")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.session_token:
        os.environ["NEOARCHIVE_SESSION_TOKEN"] = args.session_token
    print(
        "NEOARCHIVE_HANDSHAKE "
        + json.dumps(
            {
                "host": args.host,
                "port": args.port,
                "tokenRequired": bool(args.session_token),
            }
        ),
        flush=True,
    )
    uvicorn.run("neoarchive.main:app", host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":
    main()
