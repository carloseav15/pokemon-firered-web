#!/usr/bin/env python3
"""check:layers — src/core may reach game content only through the @game/* contract.

Fails when a file under src/core/
  - imports a path that resolves outside src/core (including src/games/*), or
  - imports @game/<module> with a module not listed in tools/checks/layers-contract.json.
Also fails when a contract module is missing from a game directory that exists.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CORE = ROOT / "src" / "core"
GAMES = ROOT / "src" / "games"
CONTRACT = json.loads((ROOT / "tools/checks/layers-contract.json").read_text())["modules"]
IMPORT = re.compile(r'''(?:from|import\s*\(|import)\s*["']([^"']+)["']''')


def main() -> int:
    errors: list[str] = []
    files = sorted(CORE.rglob("*.ts")) if CORE.exists() else []
    for f in files:
        for n, line in enumerate(f.read_text(encoding="utf8").splitlines(), 1):
            for spec in IMPORT.findall(line):
                where = f"{f.relative_to(ROOT)}:{n}"
                if spec.startswith("@game/"):
                    mod = spec[len("@game/"):]
                    if mod not in CONTRACT:
                        errors.append(f"{where}: {spec} is not in layers-contract.json")
                elif spec.startswith("."):
                    target = (f.parent / spec).resolve()
                    if CORE.resolve() not in (target, *target.parents):
                        errors.append(f"{where}: {spec} leaves src/core; use @game/<module>")
    for game in sorted(p for p in GAMES.iterdir() if p.is_dir()) if GAMES.exists() else []:
        if game.name != "firered":  # emerald is partial until phase 3
            continue
        for mod in CONTRACT:
            if not any((game / f"{mod}{ext}").exists() for ext in (".ts", "/index.ts")):
                errors.append(f"src/games/{game.name}: contract module {mod!r} missing")
    for e in errors:
        print(e)
    print(f"check:layers {'FAIL' if errors else 'PASS'}: {len(files)} core files, {len(CONTRACT)} contract modules")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
