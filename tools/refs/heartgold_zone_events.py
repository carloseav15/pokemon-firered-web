#!/usr/bin/env python3
"""Extract object, warp and event counts for HeartGold map zones.

Reads the pinned files/fielddata/eventdata/zone_event JSON files and writes
refs/heartgold/zone_events.json. Warp destination values are kept exactly as
represented by the source JSON (map constants or numeric sentinels).

Usage: npm run refs:heartgold-zone-events
"""

from __future__ import annotations

import json
from collections import Counter

from common import source_path, write_output


EXPECTED_ZONES = 491
ARRAY_FIELDS = ("objects", "warps", "bgs", "coords")


def read_zone(path):
    try:
        document = json.loads(path.read_text(encoding="utf8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise SystemExit(f"invalid zone JSON {path}: {error}") from None
    if not isinstance(document, dict):
        raise SystemExit(f"{path}: expected a JSON object")

    arrays = {}
    for field in ARRAY_FIELDS:
        value = document.get(field, [])
        if not isinstance(value, list) or any(not isinstance(entry, dict) for entry in value):
            raise SystemExit(f"{path}: {field} must be an array of objects when present")
        arrays[field] = value

    warps = []
    for index, warp in enumerate(arrays["warps"]):
        missing = [field for field in ("x", "y", "z", "anchor", "header") if field not in warp]
        if missing:
            raise SystemExit(f"{path}: warps[{index}] is missing fields {missing}")
        destination = warp["header"]
        if not isinstance(destination, (str, int)):
            raise SystemExit(f"{path}: warps[{index}].header has unsupported destination {destination!r}")
        warps.append({
            "x": warp["x"],
            "y": warp["y"],
            "z": warp["z"],
            "anchor": warp["anchor"],
            "destination": destination,
        })

    return {
        "zone": path.stem,
        "header": document.get("header"),
        "object_count": len(arrays["objects"]),
        "warp_count": len(warps),
        "background_event_count": len(arrays["bgs"]),
        "coordinate_event_count": len(arrays["coords"]),
        "warps": warps,
    }


def main() -> None:
    root = source_path("pokeheartgold") / "files/fielddata/eventdata/zone_event"
    paths = sorted(root.glob("*.json"))
    if len(paths) != EXPECTED_ZONES:
        raise SystemExit(f"expected {EXPECTED_ZONES} zone JSON files under {root}, found {len(paths)}")
    zones = [read_zone(path) for path in paths]
    names = [zone["zone"] for zone in zones]
    if len(set(names)) != len(names):
        raise SystemExit("duplicate zone filenames")

    totals = Counter()
    for zone in zones:
        totals.update({
            "objects": zone["object_count"],
            "warps": zone["warp_count"],
            "background_events": zone["background_event_count"],
            "coordinate_events": zone["coordinate_event_count"],
        })
    data = {"zones": zones, "totals": {"zones": len(zones), **dict(sorted(totals.items()))}}
    write_output("heartgold", "zone_events.json", data, "pokeheartgold", "tools/refs/heartgold_zone_events.py", entries=len(zones))
    print(
        f"{len(zones)} zones; {totals['objects']} objects, {totals['warps']} warps, "
        f"{totals['background_events']} background events, {totals['coordinate_events']} coordinate events"
    )


if __name__ == "__main__":
    main()
