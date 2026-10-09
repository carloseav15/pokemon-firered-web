#!/usr/bin/env python3
"""Cross-check the Emerald data exported by tools/decomp (public/emerald) against refs/emerald/*.json.

Two independent pipelines read the same pokeemerald commit: the exporter compiles the C data with clang, while
tools/refs/emerald_*.py parse the sources as text. Equal values show the exporter read the right tables; they say nothing
about the ROM or the engine. Run `EXPORT_GAME=emerald python3 tools/decomp/export.py` first. Exit status 1 on any mismatch.
"""

from __future__ import annotations

import base64
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public/emerald"
REFS = ROOT / "refs/emerald"


def load(path: Path):
    return json.loads(path.read_text())


constants = load(OUT / "constants.json")
# a byte can have several characters (0x2D is both "&" and the Japanese "を"): prefer the ASCII/Latin one
charmap: dict[str, str] = {}
for char, byte in sorted(load(OUT / "charmap.json")["chars"].items(), key=lambda kv: (ord(kv[0][0]) >= 0x3000, ord(kv[0][0]))):
    charmap.setdefault(str(byte), char)
# constants.json holds the script-visible ones; the rest (BODY_COLOR_*, ...) come from the tsconst step
TS_CONSTANTS = ROOT / "src/games/emerald/generated/constants.ts"
if TS_CONSTANTS.exists():
    for line in TS_CONSTANTS.read_text().splitlines():
        if line.startswith("export const "):
            name, value = line[len("export const "):].rstrip(";").split(" = ")
            constants.setdefault(name, int(value))
failures: list[str] = []
checked = 0


def decode(text: str) -> str:
    out = []
    for byte in base64.b64decode(text):
        if byte == 0xFF:
            break
        out.append(charmap.get(str(byte), "?"))
    return "".join(out)


def num(value):
    """Reference value (constant name, number or small macro) -> number."""
    if isinstance(value, (int, float)):
        return int(value)
    if value in constants:
        return constants[value]
    if value == "FALSE":
        return 0
    if value == "TRUE":
        return 1
    raise KeyError(value)


def expect(label: str, got, want) -> None:
    global checked
    checked += 1
    if got != want:
        failures.append(f"{label}: exported {got!r}, reference {want!r}")


def species() -> None:
    exported = load(OUT / "data/species.json")["species"]
    ref = load(REFS / "species.json")["data"]
    expect("species count", len(exported), len(ref))
    for r in ref:
        i = r["id"]
        e = exported[i]
        tag = f"species {i} {r['const']}"
        expect(tag + " base", e["base"], r["base_stats"])
        expect(tag + " types", e["types"], [num(t) for t in r["types"]])
        expect(tag + " abilities", e["abilities"], [num(a) for a in r["abilities"]])
        expect(tag + " eggGroups", e["eggGroups"], [num(g) for g in r["egg_groups"]])
        expect(tag + " catchRate", e["catchRate"], r["catch_rate"])
        expect(tag + " expYield", e["expYield"], r["exp_yield"])
        expect(tag + " evYield", e["evYield"], r["ev_yields"])
        expect(tag + " eggCycles", e["eggCycles"], r["egg_cycles"])
        expect(tag + " growth", e["growthRate"], num(r["growth_rate"]))
        expect(tag + " items", e["items"], [num(x) for x in r["items"]])
        expect(tag + " color", e["color"], num(r["body_color"]))
        if r["friendship"] == "STANDARD_FRIENDSHIP":
            expect(tag + " friendship", e["friendship"], 70)
        else:
            expect(tag + " friendship", e["friendship"], num(r["friendship"]))


def moves() -> None:
    exported = load(OUT / "data/moves.json")["moves"]
    ref = load(REFS / "moves.json")["data"]
    expect("move count", len(exported), len(ref))
    for r in ref:
        e = exported[r["id"]]
        tag = f"move {r['id']} {r['const']}"
        expect(tag + " power", e["power"], r["power"])
        expect(tag + " accuracy", e["accuracy"], r["accuracy"])
        expect(tag + " pp", e["pp"], r["pp"])
        expect(tag + " priority", e["priority"], r["priority"])
        expect(tag + " chance", e["chance"], r["effect_chance"])
        expect(tag + " type", e["type"], num(r["type"]))
        expect(tag + " effect", e["effect"], num(r["effect"]))
        expect(tag + " target", e["target"], num(r["target"]))


def trainers() -> None:
    exported = load(OUT / "data/trainers.json")
    ref = load(REFS / "trainers.json")["data"]
    expect("trainer count", len(exported), len(ref))
    for index, r in enumerate(ref):
        e = exported[index]
        tag = f"trainer {index} {r['const']}"
        expect(tag + " name", decode(e["name"]), r["name"])
        expect(tag + " class", e["class"], num(r["class"]))
        expect(tag + " double", e["double"], num(r["double"]))
        expect(tag + " party size", len(e["party"]), len(r["party"]))
        for slot, (pe, pr) in enumerate(zip(e["party"], r["party"])):
            expect(f"{tag} mon {slot} species", pe["species"], num(pr["species"]))
            expect(f"{tag} mon {slot} level", pe["level"], pr["lvl"])
            expect(f"{tag} mon {slot} iv", pe["iv"], pr["iv"])


def maps() -> None:
    ref = load(REFS / "maps.json")["data"]
    exported = load(OUT / "maps.json")
    names = {n for group in exported["groups"] for n in group}
    expect("map count", len(names), len(ref))
    expect("map names", sorted(names), sorted(r["name"] for r in ref))


def map_files() -> None:
    ref = load(REFS / "maps.json")["data"]
    by_name = {r["name"]: r for r in ref}
    for r in ref:
        path = OUT / "maps" / f"{r['id']}.json"
        if not path.exists():
            expect(f"map {r['id']} file", None, "present")
            continue
        e = load(path)
        tag = f"map {r['id']}"
        expect(tag + " name", e["name"], r["name"])
        expect(tag + " music", e["musicName"], r["music"])
        expect(tag + " weather", e["weather"], num(r["weather"]))
        expect(tag + " type", e["mapType"], num(r["map_type"]))
        for key, count in (("objects", "object_event_count"), ("warps", "warp_event_count"), ("coords", "coord_event_count"), ("bgs", "bg_event_count")):
            # maps with shared_events_map (the contest halls) reuse another map's events; the reference leaves their counts null
            owner = by_name[r["shared_events_map"]] if r["shared_events_map"] else r
            expect(f"{tag} {key}", len(e[key]), owner[count])
        expect(tag + " connections", len(e["connections"]), len(r["connections"] or []))


def wild() -> None:
    source = ROOT.parent / "refs-src/pokeemerald/src/data/wild_encounters.json"
    if not source.exists():
        print("  (skipped wild: refs-src/pokeemerald not found)")
        return
    exported = load(OUT / "data/wild.json")["maps"]
    headers: dict[str, list[dict]] = {}
    for group in load(source)["wild_encounter_groups"]:
        for entry in group["encounters"]:
            if "map" in entry:
                headers.setdefault(entry["map"], []).append(entry)
    expect("wild map set", sorted(exported), sorted(headers))
    kinds = ("land_mons", "water_mons", "rock_smash_mons", "fishing_mons")
    for map_id, e in exported.items():
        # a map can have several headers (weather/time variants): the export must equal one of them
        matches = False
        for header in headers.get(map_id, []):
            same = True
            for kind in kinds:
                src = header.get(kind)
                got = e.get(kind)
                if (src is None) != (got is None):
                    same = False
                elif src is not None:
                    want = [[m["min_level"], m["max_level"], num(m["species"])] for m in src["mons"]]
                    same = same and got["rate"] == src["encounter_rate"] and got["mons"] == want
            matches = matches or same
        expect(f"wild {map_id}", matches, True)


def incbin_sizes() -> None:
    """Sizes of the converted graphics against the source images: 4bpp = w*h/2 bytes, gbapal = 2 bytes per colour."""
    import re
    try:
        from PIL import Image
    except ImportError:
        print("  (skipped incbin sizes: Pillow not installed)")
        return
    root = ROOT.parent / "refs-src/pokeemerald"
    if not root.exists():
        print("  (skipped incbin sizes: refs-src/pokeemerald not found)")
        return
    symbols = load(OUT / "incbin/index.json")["symbols"]
    pattern = re.compile(r'(\w+)\[\]\s*=\s*INCGFX_U(?:8|16|32)\("([^"]+)",\s*"(\.4bpp|\.gbapal)(?:\.lz)?"\)')
    seen = 0
    for path in sorted((root / "src").rglob("*.[ch]")):
        for symbol, source, kind in pattern.findall(path.read_text(errors="replace")):
            # headers (trade.h) are indexed under the .c file that includes them: match on the symbol alone
            candidates = [v for k, v in symbols.items() if k.split(":")[-1] == symbol]
            if not candidates:
                expect(f"incbin {symbol} present", None, "present")
                continue
            if kind == ".4bpp" and source.endswith(".png"):
                width, height = Image.open(root / source).size
                want = width * height // 2
            elif kind == ".gbapal" and source.endswith(".pal"):
                lines = (root / source).read_text().split()
                want = int(lines[2]) * 2
            else:
                continue
            seen += 1
            expect(f"incbin {symbol} ({source}) size", want in [c[2] for c in candidates], True)
    print(f"  incbin sizes compared: {seen}")


def pokemon_images() -> None:
    from PIL import Image
    manifest = load(OUT / "gfx.json")["pokemon"]
    root = ROOT.parent / "refs-src/pokeemerald/graphics/pokemon"
    compared = 0
    for sid, name in manifest.items():
        source = root / name.lower() / "front.png"
        if source.exists():
            compared += 1
            expect(f"front {sid} {name} size", Image.open(OUT / f"gfx/pokemon/front/{sid}.png").size, Image.open(source).size)
    print(f"  Pokemon front images compared with their source png: {compared} of {len(manifest)}")


for step in (species, moves, trainers, maps, map_files, wild, incbin_sizes, pokemon_images):
    step()
print(f"{checked} comparisons, {len(failures)} mismatches")
for line in failures[:40]:
    print("  ", line)
sys.exit(1 if failures else 0)
