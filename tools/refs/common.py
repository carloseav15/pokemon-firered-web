"""Shared helpers for tools/refs: pinned reference sources and deterministic outputs.

Sources are cloned outside the repository, in $REFS_SRC or ../refs-src/<name>,
at the commit pinned in tools/refs/sources.json (see fetch.py). Extractors write
JSON under refs/<game>/ through write_output(), which embeds a `_meta` block with
the source, its pinned commit and the generator script. Never edit refs/ by hand.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCES = json.loads((ROOT / "tools/refs/sources.json").read_text())
REFS = ROOT / "refs"


def src_root() -> Path:
    return Path(os.environ.get("REFS_SRC", ROOT.parent / "refs-src")).resolve()


def source_path(name: str) -> Path:
    """Checkout of a pinned source; exits with a clear message when it is missing or not at the pin."""
    if name not in SOURCES:
        sys.exit(f"unknown source {name!r}; add it to tools/refs/sources.json")
    path = src_root() / name
    if not (path / ".git").exists():
        sys.exit(f"{path} not found: run `npm run refs:fetch -- {name}` first")
    head = subprocess.run(["git", "-C", str(path), "rev-parse", "HEAD"], capture_output=True, text=True).stdout.strip()
    if head != SOURCES[name]["commit"]:
        sys.exit(f"{path} is at {head[:10]}, pinned {SOURCES[name]['commit'][:10]}: run `npm run refs:fetch -- {name}`")
    return path


def write_output(game: str, filename: str, data: object, source: str, generator: str, entries: int | None = None) -> Path:
    """Write refs/<game>/<filename> with a `_meta` block; output is sorted and stable.

    `entries` is the count shown in refs/MANIFEST.md (default: len(data)).
    """
    out = REFS / game / filename
    out.parent.mkdir(parents=True, exist_ok=True)
    doc = {
        "_meta": {
            "source": source,
            "commit": SOURCES[source]["commit"],
            "generator": generator,
            "entries": len(data) if entries is None else entries,  # type: ignore[arg-type]
        },
        "data": data,
    }
    out.write_text(json.dumps(doc, ensure_ascii=False, indent=1, sort_keys=True) + "\n")
    print(f"wrote {out.relative_to(ROOT)}")
    return out
