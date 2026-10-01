#!/usr/bin/env python3
"""Clone or update reference sources at their pinned commit (sparse, outside the repo).

Usage: python3 tools/refs/fetch.py [name ...]   (no names = every source)
       npm run refs:fetch -- pokeemerald
"""

from __future__ import annotations

import subprocess
import sys

from common import SOURCES, src_root


def git(*args: str, cwd=None) -> None:
    subprocess.run(["git", *args], cwd=cwd, check=True)


def fetch(name: str) -> None:
    spec = SOURCES[name]
    path = src_root() / name
    if not (path / ".git").exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        git("clone", "--filter=blob:none", "--no-checkout", spec["repo"], str(path))
    git("sparse-checkout", "set", "--no-cone", *spec["sparse"], cwd=path)
    git("fetch", "--filter=blob:none", "origin", spec["commit"], cwd=path)
    git("checkout", "--detach", spec["commit"], cwd=path)
    print(f"{name}: {path} at {spec['commit'][:10]}")


if __name__ == "__main__":
    names = sys.argv[1:] or list(SOURCES)
    for n in names:
        if n not in SOURCES:
            sys.exit(f"unknown source {n!r}; known: {', '.join(SOURCES)}")
        fetch(n)
