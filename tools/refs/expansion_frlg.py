#!/usr/bin/env python3
"""Catalog where pokeemerald-expansion separates FireRed/LeafGreen from Emerald.

Expansion builds Emerald and FRLG from one tree (`make firered`); the split is
written as `IS_FRLG`, `FIRERED`, `LEAFGREEN` and `VERSION_FIRE_RED/LEAF_GREEN`
in its C sources. This script records every such site and crosses each function
with our pret catalog (refs/emerald/functions.json) and with pokefirered.

Output: refs/expansion/frlg_split.json
  functions   {"<file>:<function>": {
                 "lines": expansion lines that test the game,
                 "emerald_catalog": status of the pret Emerald/FireRed comparison
                    for the same file name (else the first file defining it)
                    ("identical", "different", "emerald_only", or "absent" when
                    pret Emerald has no function with that name),
                 "firered_file": pokefirered file that defines it, or null}}
  file_level  {"<file>": [lines]}  game tests outside any function (tables, macros)
  frlg_files  expansion .c files with "frlg" in the name
  firered_only_files {"<pokefirered file>": "<expansion file with that name>" or null}
               for every pokefirered .c file that pret Emerald does not have
Only names and line numbers are stored: no source text is copied.
A function inside a game `#if` block counts as a site of its first line.
Expansion is a community tree, not a source of truth: its FRLG mode is FireRed
running on the Emerald engine, so "different" here says where it chose to branch,
not that pret FireRed behaves that way.

Usage: npm run refs:expansion-frlg   (needs `npm run refs:fetch -- pokeemerald-expansion`)
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import portInventory as P  # noqa: E402  (read-only reuse of the inventory C parser)
from common import REFS, source_path, write_output  # noqa: E402

GAME_TEST = re.compile(r"\b(IS_FRLG|FIRERED|LEAFGREEN|VERSION_FIRE_RED|VERSION_LEAF_GREEN)\b")
PP_OPEN = re.compile(r"^\s*#\s*if")
PP_CLOSE = re.compile(r"^\s*#\s*endif\b")


def spans(text: str) -> list[tuple[str, int, int]]:
    """(name, first line, last line) of every function definition."""
    out = []
    for m in P.FUNC_RE.finditer(text):
        name = m.group(1)
        if name in P.KEYWORDS:
            continue
        start = text.count("\n", 0, m.start(1)) + 1
        body = P.body_after(text, m.end() - 1)
        open_at = text.find("{", m.end() - 1)
        end = text.count("\n", 0, open_at + len(body) + 1) + 1
        out.append((name, start, end))
    return out


def defined_functions(src: Path) -> dict[str, str]:
    """{function: file} for a decomp src/ tree (first definition wins, sorted by file)."""
    out: dict[str, str] = {}
    for path in sorted(src.glob("*.c")):
        text = P.strip_c_comments(path.read_text(errors="replace"))
        for name, _, _ in spans(text):
            out.setdefault(name, path.name)
    return out


def main() -> None:
    expansion = source_path("pokeemerald-expansion") / "src"
    firered = P.DECOMP / "src"
    catalog = json.loads((REFS / "emerald/functions.json").read_text())["data"]["files"]
    emerald_status: dict[str, str] = {}
    by_file: dict[tuple[str, str], str] = {}
    for stem, entry in sorted(catalog.items()):
        for name, (status, _, _) in entry["functions"].items():
            emerald_status.setdefault(name, status)
            by_file[(stem, name)] = status
    if not emerald_status:
        raise SystemExit("refs/emerald/functions.json is empty: run npm run refs:emerald-functions")
    fr_functions = defined_functions(firered)

    functions: dict[str, dict] = {}
    file_level: dict[str, list[int]] = {}
    for path in sorted(expansion.rglob("*.c")):
        rel = path.relative_to(expansion).as_posix()
        text = P.strip_c_comments(path.read_text(errors="replace"))
        lines = text.split("\n")
        fns = spans(text)
        hits: dict[str, list[int]] = {}
        for i, line in enumerate(lines, 1):
            if not GAME_TEST.search(line):
                continue
            inside = [f for f in fns if f[1] <= i <= f[2]]
            if inside:
                hits.setdefault(inside[0][0], []).append(i)
                continue
            if PP_OPEN.match(line):
                depth, j = 0, i - 1
                while j < len(lines):
                    if PP_OPEN.match(lines[j]):
                        depth += 1
                    elif PP_CLOSE.match(lines[j]):
                        depth -= 1
                        if depth == 0:
                            break
                    j += 1
                wrapped = [f for f in fns if i < f[1] <= j + 1]
                for name, start, _ in wrapped:
                    hits.setdefault(name, []).append(start)
                if wrapped:
                    continue
            file_level.setdefault(rel, []).append(i)
        for name, at in hits.items():
            functions[f"{rel}:{name}"] = {
                "lines": sorted(set(at)),
                "emerald_catalog": by_file.get((path.stem, name)) or emerald_status.get(name, "absent"),
                "firered_file": fr_functions.get(name),
            }

    emerald_files = {f"{name}.c" for name in catalog}
    expansion_files = {p.name: p.relative_to(expansion).as_posix() for p in expansion.rglob("*.c")}
    firered_only = {
        p.name: expansion_files.get(p.name)
        for p in sorted(firered.glob("*.c"))
        if p.name not in emerald_files
    }
    data = {
        "functions": functions,
        "file_level": file_level,
        "frlg_files": sorted(v for k, v in expansion_files.items() if "frlg" in k),
        "firered_only_files": firered_only,
    }
    write_output("expansion", "frlg_split.json", data, "pokeemerald-expansion",
                 "tools/refs/expansion_frlg.py", entries=len(functions))


if __name__ == "__main__":
    main()
