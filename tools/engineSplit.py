#!/usr/bin/env python3
"""Measure how src/fr would split into core/ and games/firered/ (task 6.1).

Read-only: prints figures and module lists, writes nothing. Inputs:
  ../pokefirered/src/*.c           FireRed C functions (parser of portInventory.py)
  refs/emerald/functions.json      Emerald status per C function (refs:emerald-functions)
  src/fr/**/*.ts                   TS definitions and relative imports

Each TS `function` named like a C function inherits that function's status:
  identical / different   same name in the same Emerald file (textual body comparison)
  moved                   FireRed-only in its file, but the name exists in another
                          Emerald file (body not compared)
  firered_only            shared file, name absent from Emerald
  fr_file_only            the .c file does not exist in Emerald
Module bucket: share = (identical+different+moved) / mapped functions;
  core >= 0.75, variant 0.30-0.75, firered < 0.30. Modules with no C homologue and
  the judgment calls listed in NO_C/OVERRIDES are fixed by hand (see
  docs/SEPARACION-MOTOR.md for the reasons).

Usage: python3 tools/engineSplit.py [--modules]
"""

from __future__ import annotations

import json
import os
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import portInventory as P  # noqa: E402  (read-only reuse of the C parser)

ROOT = P.ROOT
SRC = ROOT / "src" / "fr"
EMERALD = ROOT / "refs" / "emerald" / "functions.json"
IMPORT_RE = re.compile(r"""(?:import|export)\s[^;]*?from\s+["']([^"']+)["']""", re.S)

# TS modules without a C homologue (runtime written for the browser, tables, glue).
NO_C = {
    "core": {
        "audio/m4a", "gba/fade", "gba/sprite", "gba/stringBuffers", "gba/tasks", "gba/window",
        "hw/assets", "hw/bgRegs", "hw/cdataSprite", "hw/ppu", "rom", "script/movement",
        "battle/animArgs", "battle/animRegistry", "battle/animTasks", "battle/anims/index",
        "battle/cmds/index", "battle/host", "battle/macros", "battle/mon_transfer",
        "battle/preload", "battle/evoScene", "field/fieldTasks", "field/gfx4bpp",
        "field/hwTilesets", "field/mapNamePopup", "field/messageBox", "field/tileRenderer",
        "field/tilesetAnimator", "field/preloadField", "storageSystemInternal",
        "summaryScreen", "menus/fieldListMenu", "menus/menu", "menus/keyItemScreens",
    },
    "firered": {"boot", "startup", "battle/mugshotTransition", "menus/hardwareChoice"},
}
OVERRIDES = {
    "gba/charmap": "core", "mathUtil": "core", "hw/tilemapUtil": "core",
    "hw/text": "variant", "save": "variant",
    "battle/anims/special": "variant", "field/weatherEffects": "variant",
    "game": "firered",
    "cereaderTool": "link", "linkState": "link", "mysteryGift": "link",
    "unionRoom": "link", "wonderNews": "link",
}


def c_status() -> tuple[dict[str, str], Counter]:
    emer = json.loads(EMERALD.read_text())["data"]["files"]
    em_names = {P.norm(n) for f in emer.values() for n, v in f["functions"].items() if v[0] != "firered_only"}
    status: dict[str, str] = {}
    totals: Counter = Counter()
    for c in sorted(P.DECOMP.joinpath("src").glob("*.c")):
        ef = emer.get(c.stem)
        for name, _ in P.c_functions(c.read_text(errors="replace")):
            st = "fr_file_only" if ef is None else ef["functions"].get(name, ["firered_only"])[0]
            if st in ("firered_only", "fr_file_only") and P.norm(name) in em_names:
                st = "moved"
            totals[st] += 1
            status.setdefault(P.norm(name), st)
    return status, totals


def modules(status: dict[str, str]) -> dict[str, dict]:
    out: dict[str, dict] = {}
    for path in sorted(SRC.rglob("*.ts")):
        rel = str(path.relative_to(SRC))[:-3]
        text = path.read_text()
        code = P.strip_c_comments(text)
        st: Counter = Counter()
        for m in P.TS_FUNC_RE.finditer(code):
            st[status.get(P.norm(m.group(1)), "ts_only")] += 1
        imports = {
            os.path.normpath(os.path.join(os.path.dirname(rel), s))
            for s in IMPORT_RE.findall(text) if s.startswith(".")
        }
        out[rel] = {"lines": text.count("\n"), "status": st, "imports": imports}
    return out


def bucket(name: str, mod: dict) -> str:
    if name.startswith("generated/"):
        return "generated"
    if name in OVERRIDES:
        return OVERRIDES[name]
    for b, names in NO_C.items():
        if name in names:
            return b
    s = mod["status"]
    shared = s["identical"] + s["different"] + s["moved"]
    mapped = shared + s["firered_only"] + s["fr_file_only"]
    if not mapped:
        raise SystemExit(f"{name}: no C homologue; classify it in NO_C")
    r = shared / mapped
    return "core" if r >= 0.75 else "variant" if r >= 0.30 else "firered"


def largest_cycle(mods: dict[str, dict]) -> int:
    graph = {k: [i for i in v["imports"] if i in mods] for k, v in mods.items()}
    index: dict[str, int] = {}
    low: dict[str, int] = {}
    stack: list[str] = []
    on: set[str] = set()
    best = [0]
    sys.setrecursionlimit(10000)

    def visit(v: str) -> None:
        index[v] = low[v] = len(index)
        stack.append(v)
        on.add(v)
        for w in graph[v]:
            if w not in index:
                visit(w)
                low[v] = min(low[v], low[w])
            elif w in on:
                low[v] = min(low[v], index[w])
        if low[v] == index[v]:
            size = 0
            while True:
                w = stack.pop()
                on.discard(w)
                size += 1
                if w == v:
                    break
            best[0] = max(best[0], size)

    for v in graph:
        if v not in index:
            visit(v)
    return best[0]


def main() -> None:
    status, totals = c_status()
    mods = modules(status)
    buckets = {k: bucket(k, v) for k, v in mods.items()}

    print(f"FireRed C functions: {sum(totals.values())} {dict(sorted(totals.items()))}")
    print(f"TS modules: {len(mods)}, lines: {sum(v['lines'] for v in mods.values())}")
    print(f"Largest import cycle: {largest_cycle(mods)} modules")
    agg: dict[str, list[int]] = defaultdict(lambda: [0, 0])
    for k, b in buckets.items():
        agg[b][0] += 1
        agg[b][1] += mods[k]["lines"]
    for b in ("core", "variant", "firered", "link", "generated"):
        print(f"  {b:9s} {agg[b][0]:4d} modules {agg[b][1]:7d} lines")

    edges: dict[str, list[str]] = defaultdict(list)
    for k, v in mods.items():
        if buckets[k] == "core":
            for i in v["imports"]:
                if buckets.get(i) in ("variant", "firered", "link"):
                    edges[i].append(k)
    print(f"Imports core -> non-core: {sum(map(len, edges.values()))} "
          f"({sum(len(s) for i, s in edges.items() if buckets[i] != 'variant')} to firered/link)")
    for target, srcs in sorted(edges.items(), key=lambda x: (-len(x[1]), x[0])):
        print(f"  {target} [{buckets[target]}] <- {len(srcs)}: {', '.join(sorted(srcs))}")

    if "--modules" in sys.argv:
        for b in ("core", "variant", "firered", "link"):
            print(f"\n{b}: " + " ".join(sorted(k for k, x in buckets.items() if x == b)))


if __name__ == "__main__":
    main()
