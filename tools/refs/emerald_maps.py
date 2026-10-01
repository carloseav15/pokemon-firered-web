#!/usr/bin/env python3
"""Index map metadata and event counts from pinned pokeemerald map JSON.

Outputs refs/emerald/maps.json. Event counts are null when a map delegates its
events through shared_events_map/shared_scripts_map and omits local event lists.

Usage: npm run refs:emerald-maps (needs the pinned pokeemerald checkout).
"""

from __future__ import annotations

import json
from pathlib import Path

from common import source_path, write_output

EXPECTED_MAPS = 518
EVENT_FIELDS = ("warp_events", "object_events", "coord_events", "bg_events")
MAP_FIELDS = (
    "id", "name", "map_type", "music", "weather", "connections",
)


def read_maps(src: Path) -> list[dict]:
    root = src / "data/maps"
    paths = sorted(root.rglob("map.json"))
    if len(paths) != EXPECTED_MAPS:
        raise SystemExit(f"{root}: expected {EXPECTED_MAPS} map.json files, found {len(paths)}")

    maps = []
    seen_ids = set()
    for path in paths:
        data = json.loads(path.read_text())
        missing = [key for key in MAP_FIELDS if key not in data]
        if missing:
            raise SystemExit(f"{path}: missing map fields {missing}")
        map_id = data["id"]
        if not isinstance(map_id, str) or not map_id or map_id in seen_ids:
            raise SystemExit(f"{path}: invalid or duplicate map id {map_id!r}")
        seen_ids.add(map_id)
        if not isinstance(data["name"], str) or not data["name"]:
            raise SystemExit(f"{path}: invalid map name")
        if data["connections"] is not None and not isinstance(data["connections"], list):
            raise SystemExit(f"{path}: connections must be a list or null")

        row = {key: data[key] for key in MAP_FIELDS}
        row["shared_events_map"] = data.get("shared_events_map")
        row["shared_scripts_map"] = data.get("shared_scripts_map")
        for key in EVENT_FIELDS:
            events = data.get(key)
            if events is None:
                if key not in data and not (data.get("shared_events_map") or data.get("shared_scripts_map")):
                    raise SystemExit(f"{path}: {key} missing without shared map events")
                row[key.removesuffix("_events") + "_event_count"] = None
            elif isinstance(events, list):
                row[key.removesuffix("_events") + "_event_count"] = len(events)
            else:
                raise SystemExit(f"{path}: {key} must be a list")
        maps.append(row)

    maps.sort(key=lambda row: row["id"])
    return maps


def main() -> None:
    maps = read_maps(source_path("pokeemerald"))
    write_output("emerald", "maps.json", maps, "pokeemerald", "tools/refs/emerald_maps.py")
    shared = sum(row["object_event_count"] is None for row in maps)
    print(f"{len(maps)} maps indexed; {shared} use shared event data")


if __name__ == "__main__":
    main()
