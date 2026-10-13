"""Static GBA image composition shared by HnS and the common map catalog.
Profiles retain each source tile/metatile/palette split; index 0 is transparent.
"""
from __future__ import annotations
import base64
import struct
from pathlib import Path
from PIL import Image
TILE = 16

def words(raw: bytes) -> tuple[int, ...]:
    if len(raw) % 2:
        raise ValueError("odd-sized u16 data")
    return struct.unpack(f"<{len(raw)//2}H", raw)


class MapRenderer:
    def __init__(self, primary: dict, secondary: dict, primary_count: int = 640, primary_palettes: int = 7, backdrop=None, reserved_palettes: bool = False):
        self.primary_count = primary_count
        self.backdrop = backdrop
        if primary['isSecondary'] or not secondary['isSecondary']:
            raise ValueError('invalid primary/secondary pair')
        # CopyMapTilesetsToVram uses fixed offsets; unloaded memory remains zero.
        self.tiles = bytearray(1024 * 32)
        for source, offset, count in [(primary, 0, primary_count), (secondary, primary_count, 1024-primary_count)]:
            data = base64.b64decode(source['tiles'])[:count * 32]
            self.tiles[offset*32:offset*32+len(data)] = data
        self.palettes = primary['palettes'][:primary_palettes] + secondary['palettes'][primary_palettes:13]
        if len(self.palettes) != 13:
            raise ValueError('requires 13 BG palettes across the source profile')
        if reserved_palettes:
            # TileRenderer.reloadPalettes supplies black slots 13-15 for static BG rendering.
            self.palettes += [[[0, 0, 0]] * 16 for _ in range(3)]
        self.entries = [words(base64.b64decode(t['metatiles'])) for t in (primary, secondary)]
        self.cache = {}
        self.tile_cache = {}

    def tile(self, entry: int) -> Image.Image:
        if entry in self.tile_cache:
            return self.tile_cache[entry]
        number, palette = entry & 0x3ff, entry >> 12
        if palette >= len(self.palettes):
            raise ValueError(f'BG tile references object palette {palette}')
        data = self.tiles[number*32:(number+1)*32]
        pixels = []
        for y in range(8):
            for x in range(8):
                sx = 7-x if entry & 0x400 else x
                sy = 7-y if entry & 0x800 else y
                value = data[sy*4+sx//2]
                index = (value >> 4) if sx & 1 else value & 15
                pixels.append((*self.palettes[palette][index], 255 if index else 0))
        image = Image.new('RGBA', (8, 8))
        image.putdata(pixels)
        self.tile_cache[entry] = image
        return image

    def metatile(self, number: int) -> Image.Image:
        if number in self.cache:
            return self.cache[number]
        bank, local = (0, number) if number < self.primary_count else (1, number-self.primary_count)
        entries = self.entries[bank][local*8:local*8+8]
        if len(entries) != 8:
            raise ValueError(f'missing metatile {number}')
        image = Image.new('RGBA', (16, 16), self.backdrop or (*self.palettes[0][0], 255))
        for i, entry in enumerate(entries):
            image.alpha_composite(self.tile(entry), ((i % 2)*8, ((i % 4)//2)*8))
        self.cache[number] = image
        return image

    def map(self, layout: dict, source: Path) -> Image.Image:
        w, h = layout['width'], layout['height']
        return self.blocks(w, h, (source/layout['blockdata_filepath']).read_bytes())

    def blocks(self, w: int, h: int, raw: bytes) -> Image.Image:
        blocks = words(raw)
        if len(blocks) != w*h:
            raise ValueError('block size mismatch')
        image = Image.new('RGBA', (w*TILE, h*TILE))
        for i, block in enumerate(blocks):
            image.paste(self.metatile(block & 0x3ff), ((i % w)*TILE, (i//w)*TILE))
        return image

