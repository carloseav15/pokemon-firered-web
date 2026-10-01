#!/usr/bin/env python3
"""Extract Crystal tileset metatiles/collision and map metadata/blocks.

Usage: npm run refs:crystal-maps (needs the pinned pokecrystal checkout).
"""

from __future__ import annotations

import re
from pathlib import Path

from common import source_path, write_output

EXPECTED_TILESETS = 37
EXPECTED_TILES = 2664
EXPECTED_MAPS = 388
EXPECTED_BLKS = 302


def uncomment(line: str) -> str:
    return line.split(";", 1)[0].strip()


def tilesets(src: Path) -> list[dict]:
    root = src / "data/tilesets"
    binaries = sorted(root.glob("*_metatiles.bin"))
    if len(binaries) != EXPECTED_TILESETS:
        raise SystemExit(f"expected {EXPECTED_TILESETS} tilesets, found {len(binaries)}")
    result = []
    total = 0
    for binary in binaries:
        name = binary.name.removesuffix("_metatiles.bin")
        raw = binary.read_bytes()
        if len(raw) % 16:
            raise SystemExit(f"{binary}: length {len(raw)} is not a multiple of 16")
        blocks = [list(raw[i:i + 16]) for i in range(0, len(raw), 16)]
        collision_path = root / f"{name}_collision.asm"
        collisions = []
        for line in collision_path.read_text().splitlines():
            text = uncomment(line)
            match = re.fullmatch(r"tilecoll\s+(.+)", text, re.IGNORECASE)
            if match:
                values = [part.strip() for part in match.group(1).split(",")]
                if len(values) != 4:
                    raise SystemExit(f"{collision_path}: expected 4 tilecoll values: {line}")
                collisions.append(values)
        if len(collisions) < len(blocks):
            raise SystemExit(f"{name}: {len(blocks)} metatiles but only {len(collisions)} collision rows")
        result.append({"name": name, "blocks": blocks, "collision": collisions})
        total += len(blocks)
    if total != EXPECTED_TILES:
        raise SystemExit(f"expected {EXPECTED_TILES} total metatile blocks, found {total}")
    return result


def maps(src: Path) -> list[dict]:
    # The map macro carries name, tileset, environment, landmark, and music.
    attrs: dict[str, dict] = {}
    map_re = re.compile(r"^\s*map\s+(\w+)\s*,\s*(\w+)\s*,\s*(\w+)\s*,\s*(\w+)\s*,\s*(.+?)\s*,")
    for line in (src / "data/maps/maps.asm").read_text().splitlines():
        match = map_re.match(uncomment(line))
        if match:
            attrs[match.group(1)] = {
                "name": match.group(1), "tileset": match.group(2),
                "environment": match.group(3), "landmark": match.group(4),
                "music": match.group(5).strip(),
            }

    sizes: dict[str, tuple[int, int]] = {}
    for line in (src / "constants/map_constants.asm").read_text().splitlines():
        match = re.match(r"\s*map_const\s+(\w+)\s*,\s*(\d+)\s*,\s*(\d+)", uncomment(line))
        if match:
            sizes[match.group(1)] = (int(match.group(2)), int(match.group(3)))

    block_refs: dict[str, str] = {}
    current: list[str] = []
    for line in (src / "data/maps/blocks.asm").read_text().splitlines():
        label = re.match(r"^([A-Za-z0-9_]+)_Blocks:\s*$", uncomment(line))
        if label:
            current.append(label.group(1))
            continue
        incbin = re.search(r'INCBIN\s+"maps/([^" ]+\.blk)"', line, re.IGNORECASE)
        if incbin:
            for current_name in current:
                block_refs[current_name] = incbin.group(1)
            current = []

    connections: dict[str, list[dict]] = {}
    active: str | None = None
    for line in (src / "data/maps/attributes.asm").read_text().splitlines():
        text = uncomment(line)
        header = re.match(r"map_attributes\s+(\w+)\s*,", text)
        if header:
            active = header.group(1)
            connections.setdefault(active, [])
            continue
        conn = re.match(r"connection\s+(north|south|west|east)\s*,\s*(\w+)\s*,\s*(\w+)\s*,\s*(-?\d+)", text)
        if conn and active:
            connections[active].append({"direction": conn.group(1), "map": conn.group(2), "mapId": conn.group(3), "offset": int(conn.group(4))})

    # Map tables and map_const tables use the same group/order indices.
    map_ids = list(attrs)
    constant_ids = list(sizes)
    if len(map_ids) != len(constant_ids):
        raise SystemExit(f"map table has {len(map_ids)} maps but constants have {len(constant_ids)}")
    size_by_map = dict(zip(map_ids, (sizes[key] for key in constant_ids)))

    out = []
    seen_blks: set[str] = set()
    for name, row in attrs.items():
        width_height = size_by_map.get(name)
        if width_height is None:
            raise SystemExit(f"{name}: map_const dimensions not found")
        width, height = width_height
        blk = block_refs.get(name)
        if not blk:
            raise SystemExit(f"{name}: no INCBIN block data in data/maps/blocks.asm")
        data = (src / "maps" / blk).read_bytes()
        if len(data) != width * height:
            raise SystemExit(f"{name}: {blk} has {len(data)} bytes, expected {width * height}")
        seen_blks.add(blk)
        row.update({
            "width": width, "height": height, "blk": blk,
            "blocks": [list(data[y * width:(y + 1) * width]) for y in range(height)],
            "connections": connections.get(name, []),
        })
        out.append(row)
    if len(out) != EXPECTED_MAPS:
        raise SystemExit(f"expected {EXPECTED_MAPS} maps, found {len(out)}")
    all_blks = {path.name for path in (src / "maps").rglob("*.blk")}
    if len(all_blks) != EXPECTED_BLKS:
        raise SystemExit(f"expected {EXPECTED_BLKS} source .blk files, found {len(all_blks)}")
    return sorted(out, key=lambda row: row["name"])


def main() -> None:
    src = source_path("pokecrystal")
    ts = tilesets(src)
    map_rows = maps(src)
    source_blk_count = len({path.name for path in (src / "maps").rglob("*.blk")})
    johto = next(row for row in ts if row["name"] == "johto")
    if johto["collision"][3] != ["TALL_GRASS"] * 4:
        raise SystemExit("johto metatile 3 collision mismatch")
    if johto["collision"][7] != ["WHIRLPOOL", "BUOY", "WATER", "BUOY"]:
        raise SystemExit("johto metatile 7 collision mismatch")
    new_bark = next(row for row in map_rows if row["name"] == "NewBarkTown")
    expected_connections = [("west", "Route29"), ("east", "Route27")]
    actual_connections = [(row["direction"], row["map"]) for row in new_bark["connections"]]
    if (new_bark["tileset"], new_bark["width"], new_bark["height"], actual_connections) != (
        "TILESET_JOHTO", 10, 9, expected_connections
    ):
        raise SystemExit("NewBarkTown metadata/connections mismatch")
    write_output("crystal", "tilesets.json", ts, "pokecrystal", "tools/refs/crystal_maps.py")
    write_output("crystal", "maps.json", map_rows, "pokecrystal", "tools/refs/crystal_maps.py")
    total = sum(len(row["blocks"]) for row in ts)
    print(f"{len(ts)} tilesets, {total} blocks; {len(map_rows)} maps, {source_blk_count} distinct .blk files in maps/")
    print("verified NewBarkTown and Johto collision examples")


if __name__ == "__main__":
    main()
