#!/usr/bin/env python3
"""Import only the FireRed startup art used by the browser prototype.

The decompilation remains outside the web project. This intentionally copies
the already-decoded PNG reference assets rather than build artifacts or ROM
data, so the browser runtime has an explicit, reviewable asset boundary.
"""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path

from PIL import Image


ASSETS = (
    "graphics/intro/copyright.png",
    "graphics/intro/game_freak/bg.png",
    "graphics/intro/game_freak/game_freak.png",
    "graphics/intro/game_freak/logo.png",
    "graphics/intro/game_freak/star.png",
    "graphics/intro/game_freak/presents.png",
    "graphics/intro/game_freak/sparkles_small.png",
    "graphics/intro/game_freak/sparkles_big.png",
    "graphics/intro/scene_1/bg.png",
    "graphics/intro/scene_1/grass.png",
    "graphics/intro/scene_2/bg.png",
    "graphics/intro/scene_2/gengar.png",
    "graphics/intro/scene_2/nidorino.png",
    "graphics/intro/scene_3/bg.png",
    "graphics/intro/scene_3/gengar_static.png",
    "graphics/intro/scene_3/nidorino.png",
    "graphics/title_screen/firered/game_title_logo.png",
    "graphics/title_screen/firered/box_art_mon.png",
    "graphics/title_screen/firered/flames.png",
    "graphics/oak_speech/oak_speech_bg.png",
    "graphics/oak_speech/oak/pic.png",
    "graphics/oak_speech/red/pic.png",
    "graphics/oak_speech/leaf/pic.png",
    "graphics/oak_speech/rival/pic.png",
    "graphics/pokemon/nidoran_f/front.png",
)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--output", default=Path("public/assets/firered/startup"), type=Path)
    args = parser.parse_args()

    for relative in ASSETS:
        origin = args.source / relative
        if not origin.is_file():
            raise SystemExit(f"Missing source asset: {origin}")
        destination = args.output / relative.removeprefix("graphics/")
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(origin, destination)
        if relative == "graphics/title_screen/firered/game_title_logo.png":
            make_color_transparent(destination, (0, 255, 41))
        elif relative == "graphics/title_screen/firered/box_art_mon.png":
            make_blue_key_transparent(destination)
        elif relative == "graphics/intro/game_freak/game_freak.png":
            make_color_transparent(destination, (255, 255, 255))
        print(destination)


def make_color_transparent(path: Path, color: tuple[int, int, int]) -> None:
    image = Image.open(path).convert("RGBA")
    image.putdata([
        (red, green, blue, 0) if (red, green, blue) == color else (red, green, blue, alpha)
        for red, green, blue, alpha in image.getdata()
    ])
    image.save(path)


def make_blue_key_transparent(path: Path) -> None:
    image = Image.open(path).convert("RGBA")
    image.putdata([
        (red, green, blue, 0) if blue > red + 80 and blue > green + 80 else (red, green, blue, alpha)
        for red, green, blue, alpha in image.getdata()
    ])
    image.save(path)


if __name__ == "__main__":
    main()
