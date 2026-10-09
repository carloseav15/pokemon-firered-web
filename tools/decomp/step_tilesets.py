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


def attributes_to_32(attributes: bytes, tileset: str) -> bytes:
    """pokeemerald's 16-bit metatile attributes (behavior bits 0-7, layer type bits 12-15) in FireRed's 32-bit layout
    (behavior bits 0-8, layer type bits 29-30). Emerald stores no terrain or encounter type, so those fields stay 0.
    Refuses anything that would not survive the conversion."""
    out = bytearray()
    for index in range(0, len(attributes), 2):
        value = int.from_bytes(attributes[index:index + 2], "little")
        behavior, unused, layer = value & 0xFF, (value >> 8) & 0xF, value >> 12
        if unused or layer > 2:  # METATILE_LAYER_TYPE_NORMAL / COVERED / SPLIT
            raise RuntimeError(f"{tileset}: attribute {index // 2} = {value:#06x} does not fit the 32-bit layout")
        out += (behavior | (layer << 29)).to_bytes(4, "little")
    return bytes(out)


def export_tilesets() -> None:
    sources = (DECOMP / "src/graphics.c").read_text() + (DECOMP / "src/data/tilesets/graphics.h").read_text()
    # FireRed names the compressed binary (INCBIN_U32("dir/tiles.4bpp.lz")); pokeemerald names the source image
    # (INCGFX_U32("dir/tiles.png", ".4bpp.lz", flags)) and builds the binary from it.
    tiles_paths = dict(re.findall(r"gTilesetTiles_(\w+)\[\] = INCBIN_U32\(\"([^\"]+)/tiles\.4bpp(?:\.lz)?\"\)", sources))
    tiles_paths.update(re.findall(r"gTilesetTiles_(\w+)\[\] = INCGFX_U32\(\"([^\"]+)/tiles\.png\"", sources))
    # gbagfx keeps only the first N tiles of the png when the macro passes "-num_tiles N" (the secondary tilesets of pokeemerald)
    tile_limits = {name: int(count) for name, count in re.findall(r"gTilesetTiles_(\w+)\[\] = INCGFX_U32\(\"[^\"]+\",\s*\"[^\"]+\",\s*\"[^\"]*-num_tiles (\d+)", sources)}
    palette_paths = {}
    for name, body in re.findall(r"gTilesetPalettes_(\w+)\[\]\[16\] =\s*\{(.*?)\};", sources, flags=re.S):
        palette_paths[name] = re.findall(r"INCBIN_U16\(\"([^\"]+)\.gbapal\"\)", body) or re.findall(r"INCGFX_U16\(\"([^\"]+)\.pal\"", body)
    metatile_source = (DECOMP / "src/data/tilesets/metatiles.h").read_text()
    metatile_paths = dict(re.findall(r"gMetatiles_(\w+)\[\] = INCBIN_U16\(\"([^\"]+)\"\)", metatile_source))
    attribute_paths = dict(re.findall(r"gMetatileAttributes_(\w+)\[\] = INCBIN_U32\(\"([^\"]+)\"\)", metatile_source))
    # pokeemerald stores 16-bit attributes (8-bit behaviour, 4-bit layer type), FireRed 32-bit ones.
    attribute_paths16 = dict(re.findall(r"gMetatileAttributes_(\w+)\[\] = INCBIN_U16\(\"([^\"]+)\"\)", metatile_source))
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
        if tiles_name in tile_limits:
            tiles = tiles[:tile_limits[tiles_name] * 32]
        palettes = []
        for pal in palette_paths[pal_name]:
            palettes.append(read_jasc_palette(DECOMP / (pal + ".pal")))
        metatiles = (DECOMP / metatile_paths[meta_name]).read_bytes()
        attribute_bits = 32 if attr_name in attribute_paths else 16
        attributes = (DECOMP / (attribute_paths if attribute_bits == 32 else attribute_paths16)[attr_name]).read_bytes()
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
        if attribute_bits != 32:
            entry["attributeBits"] = attribute_bits  # FireRed's files stay exactly as before
            # the original 16-bit attributes stay in "attributes"; "attributes32" is the same data in FireRed's layout
            entry["attributes32"] = b64(attributes_to_32(attributes, symbol))
        write_json(out_dir / f"{symbol}.json", entry)
        index[symbol] = {"secondary": entry["isSecondary"], "callback": entry["callback"], "tileCount": len(tiles) // 32, "metatileCount": len(metatiles) // 16}
    write_json(OUT / "tilesets.json", index)
    print(f"  {len(index)} tilesets")
