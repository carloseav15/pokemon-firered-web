#!/usr/bin/env python3
"""Import the local FireRed Pallet Town data into web-friendly files.

This script intentionally keeps the source decompilation outside the web app.
It produces one rendered map PNG and a JSON file with map events/metadata.
"""

from __future__ import annotations

import argparse
import json
import struct
from pathlib import Path

from PIL import Image

TILE_SIZE = 8
METATILE_SIZE = 16
PRIMARY_TILE_COUNT = 640
PRIMARY_METATILE_COUNT = 640
METATILE_ENTRIES = 8


def read_u16(path: Path) -> list[int]:
    data = path.read_bytes()
    if len(data) % 2:
        raise ValueError(f"Expected an even-sized u16 file: {path}")
    return list(struct.unpack(f"<{len(data) // 2}H", data))


def read_u32(path: Path) -> list[int]:
    data = path.read_bytes()
    if len(data) % 4:
        raise ValueError(f"Expected a multiple-of-four u32 file: {path}")
    return list(struct.unpack(f"<{len(data) // 4}I", data))


def read_palette(path: Path) -> list[tuple[int, int, int]]:
    lines = [line.strip() for line in path.read_text().splitlines() if line.strip()]
    if lines[0] != "JASC-PAL":
        raise ValueError(f"Unsupported palette format: {path}")
    colors = []
    for line in lines[3:]:
        red, green, blue = (int(value) for value in line.split())
        colors.append((red, green, blue))
    return colors


def load_tileset(root: Path, kind: str, name: str) -> tuple[Image.Image, list[list[tuple[int, int, int]]], list[int]]:
    directory = root / "data" / "tilesets" / kind / name
    tiles = Image.open(directory / "tiles.png").convert("P")
    palettes = [read_palette(path) for path in sorted((directory / "palettes").glob("*.pal"))]
    metatiles = read_u16(directory / "metatiles.bin")
    return tiles, palettes, metatiles


def tile_image(tiles: Image.Image, tile_id: int, palette: list[tuple[int, int, int]], hflip: bool, vflip: bool, transparent: bool) -> Image.Image:
    tiles_per_row = tiles.width // TILE_SIZE
    left = (tile_id % tiles_per_row) * TILE_SIZE
    top = (tile_id // tiles_per_row) * TILE_SIZE
    tile = tiles.crop((left, top, left + TILE_SIZE, top + TILE_SIZE))
    if hflip:
        tile = tile.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    if vflip:
        tile = tile.transpose(Image.Transpose.FLIP_TOP_BOTTOM)

    output = Image.new("RGBA", tile.size)
    pixels = tile.load()
    out = output.load()
    for y in range(TILE_SIZE):
        for x in range(TILE_SIZE):
            value = pixels[x, y]
            color = palette[value % len(palette)]
            alpha = 0 if transparent and value == 0 else 255
            out[x, y] = (*color, alpha)
    return output


def draw_metatile(canvas: Image.Image, metatile_id: int, primary: tuple, secondary: tuple, layer_type: int, layer_filter: str | None = None) -> None:
    primary_tiles, primary_palettes, primary_metatiles = primary
    secondary_tiles, secondary_palettes, secondary_metatiles = secondary

    if metatile_id < PRIMARY_METATILE_COUNT:
        entries = primary_metatiles[metatile_id * METATILE_ENTRIES : (metatile_id + 1) * METATILE_ENTRIES]
    else:
        local_id = metatile_id - PRIMARY_METATILE_COUNT
        entries = secondary_metatiles[local_id * METATILE_ENTRIES : (local_id + 1) * METATILE_ENTRIES]

    if len(entries) != METATILE_ENTRIES:
        raise ValueError(f"Metatile {metatile_id} has {len(entries)} entries")

    if layer_filter == "base":
        layers = [0, 1] if layer_type == 1 else [0]
    elif layer_filter == "foreground":
        layers = [1] if layer_type in (0, 2) else []
    else:
        layers = [0, 1]

    for layer in layers:
        for position in range(4):
            entry = entries[layer * 4 + position]
            tile_id = entry & 0x03FF
            hflip = bool(entry & 0x0400)
            vflip = bool(entry & 0x0800)
            palette_id = (entry >> 12) & 0x0F
            uses_secondary = tile_id >= PRIMARY_TILE_COUNT
            tile_id_local = tile_id - PRIMARY_TILE_COUNT if uses_secondary else tile_id
            tiles = secondary_tiles if uses_secondary else primary_tiles
            palettes = secondary_palettes if uses_secondary else primary_palettes
            palette = palettes[palette_id]
            tile = tile_image(tile_image_source := tiles, tile_id_local, palette, hflip, vflip, transparent=layer == 1)
            x = (position % 2) * TILE_SIZE
            y = (position // 2) * TILE_SIZE
            canvas.alpha_composite(tile, (x, y))


def patch_animation_tiles(atlas: Image.Image, animation_path: Path, first_tile: int, tile_count: int) -> None:
    animation = Image.open(animation_path).convert("P")
    tiles_per_row = animation.width // TILE_SIZE
    atlas_tiles_per_row = atlas.width // TILE_SIZE
    for index in range(tile_count):
        source_x = (index % tiles_per_row) * TILE_SIZE
        source_y = (index // tiles_per_row) * TILE_SIZE
        target_tile = first_tile + index
        target_x = (target_tile % atlas_tiles_per_row) * TILE_SIZE
        target_y = (target_tile // atlas_tiles_per_row) * TILE_SIZE
        tile = animation.crop((source_x, source_y, source_x + TILE_SIZE, source_y + TILE_SIZE))
        atlas.paste(tile, (target_x, target_y))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True, help="Local pret/pokefirered checkout")
    parser.add_argument("--output", type=Path, default=Path("public/assets/firered"))
    args = parser.parse_args()

    source = args.source.resolve()
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)

    with (source / "data/maps/PalletTown/map.json").open() as file:
        map_data = json.load(file)
    with (source / "data/layouts/layouts.json").open() as file:
        layouts = json.load(file)["layouts"]
    layout = next(item for item in layouts if item.get("id") == map_data["layout"])

    primary = load_tileset(source, "primary", "general")
    secondary = load_tileset(source, "secondary", "pallet_town")
    primary_attributes = read_u32(source / "data/tilesets/primary/general/metatile_attributes.bin")
    secondary_attributes = read_u32(source / "data/tilesets/secondary/pallet_town/metatile_attributes.bin")
    map_values = read_u16(source / "data/layouts/PalletTown/map.bin")
    expected = layout["width"] * layout["height"]
    if len(map_values) != expected:
        raise ValueError(f"Map has {len(map_values)} cells; expected {expected}")

    canvas_size = (layout["width"] * METATILE_SIZE, layout["height"] * METATILE_SIZE)
    base_canvas = Image.new("RGBA", canvas_size)
    foreground_canvas = Image.new("RGBA", canvas_size)
    for y in range(layout["height"]):
        for x in range(layout["width"]):
            metatile_id = map_values[y * layout["width"] + x] & 0x03FF
            layer_type = ((primary_attributes if metatile_id < PRIMARY_METATILE_COUNT else secondary_attributes)[metatile_id if metatile_id < PRIMARY_METATILE_COUNT else metatile_id - PRIMARY_METATILE_COUNT] >> 29) & 0x03
            base_tile = Image.new("RGBA", (METATILE_SIZE, METATILE_SIZE))
            foreground_tile = Image.new("RGBA", (METATILE_SIZE, METATILE_SIZE))
            draw_metatile(base_tile, metatile_id, primary, secondary, layer_type, layer_filter="base")
            draw_metatile(foreground_tile, metatile_id, primary, secondary, layer_type, layer_filter="foreground")
            base_canvas.alpha_composite(base_tile, (x * METATILE_SIZE, y * METATILE_SIZE))
            foreground_canvas.alpha_composite(foreground_tile, (x * METATILE_SIZE, y * METATILE_SIZE))

    canvas = Image.alpha_composite(base_canvas, foreground_canvas)
    canvas.save(output / "pallet_town.png")
    base_canvas.save(output / "pallet_town_base.png")
    foreground_canvas.save(output / "pallet_town_foreground.png")

    animated_frames = []
    animated_base_frames = []
    animated_foreground_frames = []
    general_tiles_path = source / "data/tilesets/primary/general/tiles.png"
    for frame_index in range(16):
        animated_primary_tiles = Image.open(general_tiles_path).convert("P")
        patch_animation_tiles(
            animated_primary_tiles,
            source / f"data/tilesets/primary/general/anim/water_current_landwatersedge/{(frame_index // 2) % 8}.png",
            416,
            48,
        )
        patch_animation_tiles(
            animated_primary_tiles,
            source / f"data/tilesets/primary/general/anim/sandwatersedge/{frame_index % 8}.png",
            464,
            18,
        )
        patch_animation_tiles(
            animated_primary_tiles,
            source / f"data/tilesets/primary/general/anim/flower/{(frame_index // 2) % 5}.png",
            508,
            4,
        )
        animated_base = Image.new("RGBA", canvas_size)
        animated_foreground = Image.new("RGBA", canvas_size)
        animated_primary = (animated_primary_tiles, primary[1], primary[2])
        for y in range(layout["height"]):
            for x in range(layout["width"]):
                metatile_id = map_values[y * layout["width"] + x] & 0x03FF
                layer_type = ((primary_attributes if metatile_id < PRIMARY_METATILE_COUNT else secondary_attributes)[metatile_id if metatile_id < PRIMARY_METATILE_COUNT else metatile_id - PRIMARY_METATILE_COUNT] >> 29) & 0x03
                base_tile = Image.new("RGBA", (METATILE_SIZE, METATILE_SIZE))
                foreground_tile = Image.new("RGBA", (METATILE_SIZE, METATILE_SIZE))
                draw_metatile(base_tile, metatile_id, animated_primary, secondary, layer_type, layer_filter="base")
                draw_metatile(foreground_tile, metatile_id, animated_primary, secondary, layer_type, layer_filter="foreground")
                animated_base.alpha_composite(base_tile, (x * METATILE_SIZE, y * METATILE_SIZE))
                animated_foreground.alpha_composite(foreground_tile, (x * METATILE_SIZE, y * METATILE_SIZE))
        animated_canvas = Image.alpha_composite(animated_base, animated_foreground)
        animated_frames.append(animated_canvas)
        animated_base_frames.append(animated_base)
        animated_foreground_frames.append(animated_foreground)

    animated_sheet = Image.new("RGBA", (canvas.width * len(animated_frames), canvas.height))
    for index, frame in enumerate(animated_frames):
        animated_sheet.alpha_composite(frame, (index * canvas.width, 0))
    animated_sheet.save(output / "pallet_town_anim.png")

    def save_sheet(frames: list[Image.Image], path: Path) -> None:
        sheet = Image.new("RGBA", (canvas.width * len(frames), canvas.height))
        for index, frame in enumerate(frames):
            sheet.alpha_composite(frame, (index * canvas.width, 0))
        sheet.save(path)

    save_sheet(animated_base_frames, output / "pallet_town_base_anim.png")
    save_sheet(animated_foreground_frames, output / "pallet_town_foreground_anim.png")

    web_data = {
        "id": map_data["id"],
        "name": map_data["name"],
        "width": layout["width"],
        "height": layout["height"],
        "tileSize": METATILE_SIZE,
        "ambientAnimation": {"frames": 16, "frameWidth": canvas.width, "frameHeight": canvas.height},
        "layers": {
            "base": "pallet_town_base_anim.png",
            "foreground": "pallet_town_foreground_anim.png",
        },
        "primaryTileset": "general",
        "secondaryTileset": "pallet_town",
        "walkable": [
            [((map_values[y * layout["width"] + x] >> 10) & 0x03) == 0 for x in range(layout["width"])]
            for y in range(layout["height"])
        ],
        "collision": [
            [((map_values[y * layout["width"] + x] >> 10) & 0x03) for x in range(layout["width"])]
            for y in range(layout["height"])
        ],
        "elevation": [
            [(map_values[y * layout["width"] + x] >> 12) & 0x0F for x in range(layout["width"])]
            for y in range(layout["height"])
        ],
        "terrain": [
            [
                (((primary_attributes if (map_values[y * layout["width"] + x] & 0x03FF) < PRIMARY_METATILE_COUNT else secondary_attributes)[
                    (map_values[y * layout["width"] + x] & 0x03FF)
                    if (map_values[y * layout["width"] + x] & 0x03FF) < PRIMARY_METATILE_COUNT
                    else (map_values[y * layout["width"] + x] & 0x03FF) - PRIMARY_METATILE_COUNT
                ] >> 9) & 0x1F)
                for x in range(layout["width"])
            ]
            for y in range(layout["height"])
        ],
        "behavior": [
            [
                ((primary_attributes if (map_values[y * layout["width"] + x] & 0x03FF) < PRIMARY_METATILE_COUNT else secondary_attributes)[
                    (map_values[y * layout["width"] + x] & 0x03FF)
                    if (map_values[y * layout["width"] + x] & 0x03FF) < PRIMARY_METATILE_COUNT
                    else (map_values[y * layout["width"] + x] & 0x03FF) - PRIMARY_METATILE_COUNT
                ] & 0x1FF)
                for x in range(layout["width"])
            ]
            for y in range(layout["height"])
        ],
        "connections": map_data.get("connections", []),
        "objectEvents": map_data.get("object_events", []),
        "warpEvents": map_data.get("warp_events", []),
        "coordEvents": map_data.get("coord_events", []),
        "backgroundEvents": map_data.get("bg_events", []),
    }
    (output / "pallet_town.json").write_text(json.dumps(web_data, indent=2) + "\n")
    print(f"Generated {canvas.width}x{canvas.height} Pallet Town map")
    print(f"Generated {len(web_data['objectEvents'])} object events and {len(web_data['warpEvents'])} warps")


if __name__ == "__main__":
    main()
