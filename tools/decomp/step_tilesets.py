"""Export every tileset as raw GBA data (4bpp tiles, palettes, metatiles).

The browser composes metatiles from these tiles the same way the GBA BG
hardware does, so tileset animations can overwrite tiles at runtime.
"""

from __future__ import annotations

import base64
import re

from common import DECOMP, OUT, png_indices, read_jasc_palette, to_4bpp_tiles, write_json


def b64(data: bytes) -> str:
    return base64.b64encode(data).decode()


def export_tilesets() -> None:
    sources = (DECOMP / "src/graphics.c").read_text() + (DECOMP / "src/data/tilesets/graphics.h").read_text()
    tiles_paths = dict(re.findall(r"gTilesetTiles_(\w+)\[\] = INCBIN_U32\(\"([^\"]+)/tiles\.4bpp(?:\.lz)?\"\)", sources))
    palette_paths = {}
    for name, body in re.findall(r"gTilesetPalettes_(\w+)\[\]\[16\] =\s*\{(.*?)\};", sources, flags=re.S):
        palette_paths[name] = re.findall(r"INCBIN_U16\(\"([^\"]+)\.gbapal\"\)", body)
    metatile_source = (DECOMP / "src/data/tilesets/metatiles.h").read_text()
    metatile_paths = dict(re.findall(r"gMetatiles_(\w+)\[\] = INCBIN_U16\(\"([^\"]+)\"\)", metatile_source))
    attribute_paths = dict(re.findall(r"gMetatileAttributes_(\w+)\[\] = INCBIN_U32\(\"([^\"]+)\"\)", metatile_source))
    headers = (DECOMP / "src/data/tilesets/headers.h").read_text()
    out_dir = OUT / "tilesets"
    out_dir.mkdir(parents=True, exist_ok=True)
    index = {}
    for symbol, body in re.findall(r"const struct Tileset (gTileset_\w+) =\s*\{(.*?)\};", headers, flags=re.S):
        fields = dict(re.findall(r"\.(\w+)\s*=\s*([^,\n]+)", body))
        tiles_name = fields["tiles"].strip().removeprefix("gTilesetTiles_")
        pal_name = fields["palettes"].strip().removeprefix("gTilesetPalettes_")
        meta_name = fields["metatiles"].strip().removeprefix("gMetatiles_")
        attr_name = fields["metatileAttributes"].strip().removeprefix("gMetatileAttributes_")
        callback = fields.get("callback", "NULL").strip()
        folder = DECOMP / tiles_paths[tiles_name]
        width, height, indices, _ = png_indices(folder / "tiles.png")
        tiles = to_4bpp_tiles(width, height, indices)
        palettes = []
        for pal in palette_paths[pal_name]:
            palettes.append(read_jasc_palette(DECOMP / (pal + ".pal")))
        metatiles = (DECOMP / metatile_paths[meta_name]).read_bytes()
        attributes = (DECOMP / attribute_paths[attr_name]).read_bytes()
        anims = {}
        anim_dir = folder / "anim"
        if anim_dir.exists():
            for group in sorted(p for p in anim_dir.iterdir() if p.is_dir()):
                frames = []
                numbered = sorted((p for p in group.glob("*.png")), key=lambda p: int(p.stem) if p.stem.isdigit() else 999)
                for frame in numbered:
                    fw, fh, fi, _ = png_indices(frame)
                    frames.append(b64(to_4bpp_tiles(fw, fh, fi)))
                anims[group.name] = frames
        entry = {
            "name": symbol,
            "isSecondary": fields.get("isSecondary", "FALSE").strip() == "TRUE",
            "callback": None if callback == "NULL" else callback,
            "tiles": b64(tiles),
            "palettes": palettes,
            "metatiles": b64(metatiles),
            "attributes": b64(attributes),
            "anims": anims,
        }
        write_json(out_dir / f"{symbol}.json", entry)
        index[symbol] = {"secondary": entry["isSecondary"], "callback": entry["callback"], "tileCount": len(tiles) // 32, "metatileCount": len(metatiles) // 16}
    write_json(OUT / "tilesets.json", index)
    print(f"  {len(index)} tilesets")
