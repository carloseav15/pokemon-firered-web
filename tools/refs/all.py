#!/usr/bin/env python3
"""Regenerate and validate every checked-in refs output.

Usage: npm run refs:all (requires the pinned source checkouts).
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
EXCLUDED = {"refs:all", "refs:check", "refs:fetch", "refs:pokeapi"}


def run(*args: str) -> None:
    result = subprocess.run(args, cwd=ROOT)
    if result.returncode:
        raise SystemExit(result.returncode)


def main() -> None:
    package = json.loads((ROOT / "package.json").read_text())
    scripts = package.get("scripts", {})
    generators = [name for name in scripts if name.startswith("refs:") and name not in EXCLUDED]
    if not generators:
        raise SystemExit("no refs generators found in package.json")

    for name in generators:
        print(f"\n==> npm run {name}", flush=True)
        run("npm", "run", name)

    print("\n==> npm run refs:check -- --write", flush=True)
    run("npm", "run", "refs:check", "--", "--write")
    print("\n==> npm run refs:check", flush=True)
    run("npm", "run", "refs:check")

    result = subprocess.run(
        ["git", "status", "--short", "--", "refs/"],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    if result.returncode:
        raise SystemExit(result.returncode)
    if result.stdout.strip():
        print("refs outputs changed; regenerate/stage the updated outputs:\n" + result.stdout, file=sys.stderr)
        raise SystemExit(1)
    print(f"refs:all PASS ({len(generators)} generators; refs/ unchanged)")


if __name__ == "__main__":
    main()
