#!/usr/bin/env python3
"""check:warps — the warp and connection graph of the exported maps is consistent (FireRed and Emerald).

Errors (exit 1):
  - a warp whose destMap is not an exported map (MAP_DYNAMIC / MAP_NONE are the C's own special values);
  - a warp whose destWarpId is not a warp of the destination map (WARP_ID_NONE, 0x7F/-1, means "use x,y" and is allowed);
  - a connection to a map that does not exist.
Reported, not failed: events outside the layout bounds (the decomp's own map.json has them: objects parked off-map that
scripts move in, warps on the map edge, unused maps with a 1x1 layout), one-way warps (the destination warp does not lead back), connections without a reverse one,
and maps with no incoming warp or connection.

Usage: python3 tools/checks/warps.py [--list]   (--list prints every finding)
"""
from __future__ import annotations

import json
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SPECIAL = {"MAP_DYNAMIC", "MAP_NONE"}
OPPOSITE = {"up": "down", "down": "up", "left": "right", "right": "left", "dive": "emerge", "emerge": "dive"}
WARP_ID_NONE = {127, 255, -1}


def check(game: str, data: str) -> tuple[list[str], dict[str, list[str]], dict]:
    maps_dir = ROOT / "public" / data / "maps"
    layouts_dir = ROOT / "public" / data / "layouts"
    maps = {p.stem: json.loads(p.read_text()) for p in sorted(maps_dir.glob("MAP_*.json"))}
    dims: dict[str, tuple[int, int]] = {}
    for p in layouts_dir.glob("LAYOUT_*.json"):
        j = json.loads(p.read_text())
        dims[j["id"]] = (j["width"], j["height"])
    errors: list[str] = []
    info: dict[str, list[str]] = defaultdict(list)
    incoming: dict[str, int] = defaultdict(int)
    stats = {"maps": len(maps), "warps": 0, "dynamic": 0, "by_coords": 0, "connections": 0}
    for mid, m in maps.items():
        w, h = dims.get(m["layout"], (None, None))
        if w is None:
            errors.append(f"{mid}: layout {m['layout']} missing")
            continue

        def inside(x: int, y: int) -> bool:
            return 0 <= x < w and 0 <= y < h

        for i, wp in enumerate(m["warps"]):
            stats["warps"] += 1
            if not inside(wp["x"], wp["y"]):
                info["off_map_events"].append(f"{mid}: warp {i} at ({wp['x']},{wp['y']}) outside {w}x{h}")
            dest = wp["destMap"]
            if dest in SPECIAL:
                stats["dynamic"] += 1
                continue
            if dest not in maps:
                errors.append(f"{mid}: warp {i} -> unknown map {dest}")
                continue
            incoming[dest] += 1
            wid = wp["destWarpId"]
            if wid in WARP_ID_NONE:
                stats["by_coords"] += 1
                continue
            dw = maps[dest]["warps"]
            if not 0 <= wid < len(dw):
                errors.append(f"{mid}: warp {i} -> {dest} warp {wid} but it has {len(dw)}")
                continue
            back = dw[wid]["destMap"]
            if back != mid:
                info["one_way_warps"].append(f"{mid}#{i} -> {dest}#{wid} (which leads to {back})")
        for kind in ("objects", "coords"):
            for i, e in enumerate(m[kind]):
                if not inside(e["x"], e["y"]):
                    info["off_map_events"].append(f"{mid}: {kind[:-1]} {i} at ({e['x']},{e['y']}) outside {w}x{h}")
        for i, b in enumerate(m["bgs"]):
            if not inside(b["x"], b["y"]):
                info["off_map_events"].append(f"{mid}: bg {i} at ({b['x']},{b['y']}) outside {w}x{h}")
        for c in m["connections"]:
            stats["connections"] += 1
            tgt = c["map"]
            if tgt not in maps:
                errors.append(f"{mid}: connection {c['direction']} -> unknown map {tgt}")
                continue
            incoming[tgt] += 1
            rev = [x for x in maps[tgt]["connections"] if x["map"] == mid]
            if not any(x["direction"] == OPPOSITE.get(c["direction"]) for x in rev):
                info["connection_without_reverse"].append(f"{mid} {c['direction']} -> {tgt}")
    for mid in maps:
        if incoming[mid] == 0:
            info["unreachable_by_warp_or_connection"].append(mid)
    return errors, info, stats


def main() -> int:
    show = "--list" in sys.argv
    failed = False
    for game, data in (("FireRed", "fr"), ("Emerald", "emerald")):
        if not (ROOT / "public" / data / "maps").exists():
            print(f"{game}: public/{data}/maps missing, skipped")
            continue
        errors, info, stats = check(game, data)
        print(f"{game}: {stats['maps']} maps, {stats['warps']} warps ({stats['dynamic']} dynamic, {stats['by_coords']} by coordinates), "
              f"{stats['connections']} connections; {len(errors)} errors")
        for k, v in info.items():
            print(f"  {k}: {len(v)}")
            if show:
                for x in v:
                    print(f"    {x}")
        for e in errors[: (None if show else 15)]:
            print(f"  ERROR {e}")
        failed = failed or bool(errors)
    print("check:warps " + ("FAIL" if failed else "PASS"))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
