#!/usr/bin/env python3
"""Serve a generated analytics report using only the Python standard library."""

from __future__ import annotations

import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


ROOT = Path(__file__).resolve().parent
REPORTS_DIR = ROOT / "reports"


def arguments() -> argparse.Namespace:
    """Parse local static-server options."""
    parser = argparse.ArgumentParser(description="Serve a ChatGPT analytics report")
    parser.add_argument(
        "--host",
        default="0.0.0.0",
        help="address to bind to (default: 0.0.0.0)",
    )
    parser.add_argument("--port", type=int, default=8761, help="port to listen on (default: 8761)")
    return parser.parse_args()


def main() -> None:
    """Serve the report directory until interrupted."""
    args = arguments()
    if not REPORTS_DIR.is_dir():
        raise SystemExit(f"Reports directory does not exist: {REPORTS_DIR}. Run analyze.py first.")
    handler = partial(SimpleHTTPRequestHandler, directory=str(REPORTS_DIR))
    server = ThreadingHTTPServer((args.host, args.port), handler)
    print(f"Serving {REPORTS_DIR}")
    print(f"Open http://{args.host}:{args.port}/report.html")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
