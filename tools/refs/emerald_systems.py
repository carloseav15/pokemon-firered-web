#!/usr/bin/env python3
"""Group Emerald-only C files into game systems.

Input: refs/emerald/functions.json, including per-file status, line counts and
function catalogs. Output: refs/emerald/systems.json.

Usage: npm run refs:emerald-systems
"""

from __future__ import annotations

import json
from collections import Counter

from common import ROOT, write_output


SYSTEM_PREFIXES = {
    "battle_frontier": ("battle_dome", "battle_factory", "battle_pike", "battle_pyramid", "battle_arena", "battle_palace", "battle_tent", "battle_tower", "battle_transition_frontier", "frontier_", "apprentice", "trainer_hill"),
    "contests": ("contest",),
    "pokeblocks_berries": ("pokeblock", "use_pokeblock", "berry_blender", "berry_tag_screen"),
    "pokenav_match_call": ("pokenav", "match_call"),
    "secret_bases": ("secret_base",),
    "tv_characters": ("tv", "mauville_old_man", "lilycove_lady", "dewford_trend", "bard_music", "walda_phrase"),
    "story_scenes": ("rayquaza_scene", "mirage_tower", "faraway_island", "cable_car", "braille", "braille_puzzles", "rotating_gate", "rotating_tile_puzzle"),
    "clock_rtc": ("wallclock", "reset_rtc_screen", "rtc", "clock", "siirtc", "time_events"),
    "link_recording": ("record_mixing", "recorded_battle", "battle_controller_recorded_"),
}


def system_for(filename: str) -> str:
    matches = [name for name, prefixes in SYSTEM_PREFIXES.items() if filename.startswith(prefixes)]
    if len(matches) > 1:
        raise SystemExit(f"{filename}: assigned to multiple systems: {matches}")
    return matches[0] if matches else "other"


def main() -> None:
    catalog = json.loads((ROOT / "refs/emerald/functions.json").read_text(encoding="utf8"))["data"]
    files = catalog.get("files")
    if not isinstance(files, dict):
        raise SystemExit("refs/emerald/functions.json: missing data.files object")

    grouped: dict[str, list[dict]] = {}
    for filename, row in files.items():
        if row.get("status") != "emerald_only":
            continue
        functions = row.get("functions")
        if not isinstance(functions, dict):
            raise SystemExit(f"{filename}: missing functions object")
        grouped.setdefault(system_for(filename), []).append({
            "file": filename,
            "lines": row["lines"],
            "functions": len(functions),
        })

    result = []
    for system, entries in sorted(grouped.items()):
        entries.sort(key=lambda entry: entry["file"])
        result.append({
            "system": system,
            "files": entries,
            "file_count": len(entries),
            "lines": sum(entry["lines"] for entry in entries),
            "functions": sum(entry["functions"] for entry in entries),
        })

    counts = Counter(row["system"] for row in result for _ in row["files"])
    total_files = sum(counts.values())
    total_lines = sum(row["lines"] for row in result)
    if total_files != 103 or total_lines != 123905:
        raise SystemExit(f"expected verified source totals 103 files / 123905 lines; got {total_files} / {total_lines}")
    if len({entry["file"] for row in result for entry in row["files"]}) != total_files:
        raise SystemExit("an Emerald-only file was assigned more than once")

    write_output("emerald", "systems.json", result, "pokeemerald", "tools/refs/emerald_systems.py")
    print(f"{total_files} files, {total_lines} lines, {sum(row['functions'] for row in result)} functions")
    print(", ".join(f"{row['system']}: {row['file_count']} files" for row in result))


if __name__ == "__main__":
    main()
