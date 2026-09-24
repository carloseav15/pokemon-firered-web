#!/usr/bin/env python3
"""Compose FireRed intro layers from GBA tile sheets and tilemaps.

The PNGs in the decompilation are *tile sheets*, not finished screens. This
tool replays the GBA screen-entry tilemap format (tile index plus X/Y flips)
into composed 240x160 PNG layers and 256x512 scrollable BG maps for Phaser.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image

SCREEN = (240, 160)


def compose(tiles_path: Path, map_path: Path, output: Path, transparent=None, scroll_y: int = 0) -> None:
    canvas = compose_virtual_bg(tiles_path, map_path, transparent)
    # FireRed scrolls these 512px virtual backgrounds in hardware. Preserve
    # that behavior by composing the visible screen at the source BG offset,
    # including the wrap at the bottom of the tilemap.
    scroll_y %= canvas.height
    viewport = Image.new("RGBA", SCREEN, transparent or (0, 0, 0, 0))
    for y in range(SCREEN[1]):
        source_y = (scroll_y + y) % canvas.height
        viewport.paste(canvas.crop((0, source_y, SCREEN[0], source_y + 1)), (0, y))
    output.parent.mkdir(parents=True, exist_ok=True)
    viewport.save(output)


def compose_virtual_bg(tiles_path: Path, map_path: Path, transparent=None) -> Image.Image:
    tiles = Image.open(tiles_path).convert("RGBA")
    # The files use 16-bit little-endian GBA screen entries. macOS happens to
    # be little endian, but decode explicitly so the generated asset is stable.
    data = map_path.read_bytes()
    words = [data[index] | data[index + 1] << 8 for index in range(0, len(data), 2)]
    width = 32
    height = len(words) // width
    canvas = Image.new("RGBA", (width * 8, height * 8), transparent or (0, 0, 0, 0))
    columns = tiles.width // 8
    for index, entry in enumerate(words):
        tile_index = entry & 0x03FF
        sx, sy = (tile_index % columns) * 8, (tile_index // columns) * 8
        if sy >= tiles.height:
            continue
        tile = tiles.crop((sx, sy, sx + 8, sy + 8))
        if entry & 0x0400:
            tile = tile.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
        if entry & 0x0800:
            tile = tile.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
        canvas.alpha_composite(tile, ((index % width) * 8, (index // width) * 8))
    if transparent:
        canvas = key_transparent(canvas, transparent)
    return canvas


def compose_map(tiles_path: Path, map_path: Path, output: Path, transparent=None) -> None:
    canvas = compose_virtual_bg(tiles_path, map_path, transparent)
    output.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(output)


def key_transparent(image: Image.Image, color: tuple[int, int, int]) -> Image.Image:
    rgba = image.convert("RGBA")
    rgba.putdata([
        (red, green, blue, 0) if (red, green, blue) == color else (red, green, blue, alpha)
        for red, green, blue, alpha in rgba.getdata()
    ])
    return rgba


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=Path("public/assets/firered/composed_intro"))
    args = parser.parse_args()
    source, output = args.source / "graphics", args.output
    layers = [
        ("intro/game_freak/bg", "intro/game_freak/bg", None),
        ("intro/scene_1/bg", "intro/scene_1/bg", None),
        ("intro/scene_1/grass", "intro/scene_1/grass", None),
        ("intro/scene_2/bg", "intro/scene_2/bg", None),
        ("intro/scene_2/plants", "intro/scene_2/plants", None),
        ("intro/scene_2/gengar_close", "intro/scene_2/gengar_close", None),
        ("intro/scene_2/nidorino_close", "intro/scene_2/nidorino_close", None),
        ("intro/scene_3/bg", "intro/scene_3/bg", None),
        ("intro/scene_3/gengar_anim", "intro/scene_3/gengar_anim", None),
        ("title_screen/firered/game_title_logo", "title_screen/firered/game_title_logo", (0, 255, 41)),
        ("title_screen/firered/box_art_mon", "title_screen/firered/box_art_mon", (0, 0, 255)),
        ("title_screen/border_bg", "title_screen/firered/border_bg", None),
        ("title_screen/copyright_press_start", "title_screen/copyright_press_start", None),
    ]
    source_scrolls = {
        "intro/scene_2/gengar_close": 462,  # BG Y = 0x1CE00 in intro.c
        "intro/scene_2/nidorino_close": 40,  # BG Y = 0x02800 in intro.c
    }
    for tile_path, map_path, key in layers:
        destination = output / f"{map_path}.png"
        compose(source / f"{tile_path}.png", source / f"{map_path}.bin", destination, key, source_scrolls.get(map_path, 0))
        print(destination)

    # Keep the full 256x512 GBA BG maps so Phaser can reproduce register-based
    # X/Y scrolling and wrapping rather than swapping hand-picked screen crops.
    for name in (
        "intro/scene_1/bg",
        "intro/scene_1/grass",
        "intro/scene_2/bg",
        "intro/scene_2/plants",
        "intro/scene_3/bg",
        "intro/scene_3/gengar_anim",
    ):
        tiles = source / f"{name}.png"
        tilemap = source / f"{name}.bin"
        destination = output / f"{name}_map.png"
        compose_map(tiles, tilemap, destination)
        print(destination)


if __name__ == "__main__":
    main()
