#!/usr/bin/env python3
"""Render selected FireRed decompilation maps for the private web prototype."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

from PIL import Image

from import_pallet_town import (
    METATILE_SIZE,
    PRIMARY_METATILE_COUNT,
    draw_metatile,
    load_tileset,
    read_u16,
    read_u32,
)

MAP_FOLDERS = {
    "MAP_PALLET_TOWN_PLAYERS_HOUSE_1F": "PalletTown_PlayersHouse_1F",
    "MAP_PALLET_TOWN_PLAYERS_HOUSE_2F": "PalletTown_PlayersHouse_2F",
    "MAP_PALLET_TOWN_RIVALS_HOUSE": "PalletTown_RivalsHouse",
    "MAP_PALLET_TOWN_PROFESSOR_OAKS_LAB": "PalletTown_ProfessorOaksLab",
    "MAP_ROUTE1": "Route1",
}


def tileset_directory_name(symbol: str) -> str:
    name = symbol.removeprefix("gTileset_")
    name = re.sub(r"(?<!^)([A-Z])", r"_\1", name)
    name = re.sub(r"([A-Za-z])([0-9])", r"\1_\2", name)
    return name.lower()


def render_map(source: Path, output: Path, map_id: str) -> None:
    map_folder = source / "data/maps" / MAP_FOLDERS[map_id]
    map_data = json.loads((map_folder / "map.json").read_text())
    layouts = json.loads((source / "data/layouts/layouts.json").read_text())["layouts"]
    layout = next(item for item in layouts if item.get("id") == map_data["layout"])

    primary_name = tileset_directory_name(layout["primary_tileset"])
    secondary_name = tileset_directory_name(layout["secondary_tileset"])
    primary = load_tileset(source, "primary", primary_name)
    secondary = load_tileset(source, "secondary", secondary_name)
    primary_attributes = read_u32(source / f"data/tilesets/primary/{primary_name}/metatile_attributes.bin")
    secondary_attributes = read_u32(source / f"data/tilesets/secondary/{secondary_name}/metatile_attributes.bin")
    map_values = read_u16(source / Path(layout["blockdata_filepath"]))
    expected = layout["width"] * layout["height"]
    if len(map_values) != expected:
        raise ValueError(f"{map_id}: map has {len(map_values)} cells; expected {expected}")

    size = (layout["width"] * METATILE_SIZE, layout["height"] * METATILE_SIZE)
    base = Image.new("RGBA", size)
    foreground = Image.new("RGBA", size)
    collision = []
    elevation = []
    terrain = []
    behavior = []

    for y in range(layout["height"]):
        collision_row, elevation_row, terrain_row, behavior_row = [], [], [], []
        for x in range(layout["width"]):
            value = map_values[y * layout["width"] + x]
            metatile_id = value & 0x03FF
            attributes = primary_attributes if metatile_id < PRIMARY_METATILE_COUNT else secondary_attributes
            local_id = metatile_id if metatile_id < PRIMARY_METATILE_COUNT else metatile_id - PRIMARY_METATILE_COUNT
            attr = attributes[local_id]
            layer_type = (attr >> 29) & 0x03
            base_tile = Image.new("RGBA", (METATILE_SIZE, METATILE_SIZE))
            foreground_tile = Image.new("RGBA", (METATILE_SIZE, METATILE_SIZE))
            draw_metatile(base_tile, metatile_id, primary, secondary, layer_type, layer_filter="base")
            draw_metatile(foreground_tile, metatile_id, primary, secondary, layer_type, layer_filter="foreground")
            base.alpha_composite(base_tile, (x * METATILE_SIZE, y * METATILE_SIZE))
            foreground.alpha_composite(foreground_tile, (x * METATILE_SIZE, y * METATILE_SIZE))
            collision_row.append((value >> 10) & 0x03)
            elevation_row.append((value >> 12) & 0x0F)
            terrain_row.append((attr >> 9) & 0x1F)
            behavior_row.append(attr & 0x1FF)
        collision.append(collision_row)
        elevation.append(elevation_row)
        terrain.append(terrain_row)
        behavior.append(behavior_row)

    map_output = output / "maps" / map_id.removeprefix("MAP_").lower()
    map_output.mkdir(parents=True, exist_ok=True)
    base.save(map_output / "base.png")
    foreground.save(map_output / "foreground.png")
    web_data = {
        "id": map_data["id"],
        "name": map_data["name"],
        "width": layout["width"],
        "height": layout["height"],
        "tileSize": METATILE_SIZE,
        "base": f"maps/{map_id.removeprefix('MAP_').lower()}/base.png",
        "foreground": f"maps/{map_id.removeprefix('MAP_').lower()}/foreground.png",
        "music": map_data.get("music"),
        "mapType": map_data.get("map_type"),
        "showMapName": map_data.get("show_map_name", False),
        "collision": collision,
        "walkable": [[cell == 0 for cell in row] for row in collision],
        "elevation": elevation,
        "terrain": terrain,
        "behavior": behavior,
        "connections": map_data.get("connections") or [],
        "objectEvents": map_data.get("object_events", []),
        "warpEvents": map_data.get("warp_events", []),
        "coordEvents": map_data.get("coord_events", []),
        "backgroundEvents": map_data.get("bg_events", []),
    }
    (map_output / "map.json").write_text(json.dumps(web_data, indent=2) + "\n")
    print(f"Generated {map_id}: {size[0]}x{size[1]}, {len(web_data['objectEvents'])} objects, {len(web_data['warpEvents'])} warps")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=Path("public/assets/firered"))
    args = parser.parse_args()
    for map_id in MAP_FOLDERS:
        render_map(args.source.resolve(), args.output.resolve(), map_id)


if __name__ == "__main__":
    main()
