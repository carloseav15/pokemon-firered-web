#!/usr/bin/env python3
"""Compose the Fairy type icon for the menu-info sheet (window type labels) from FireRed's own icons.

FireRed's sheet (gMenuInfoElements_Gfx) has a 32x12 label per type and none for Fairy. Pokémon Heart & Soul's sheet
does not carry one either (its Fairy slot at tile 0x04 is blank), so there is no art to borrow. The icon is built from
glyphs already in the sheet, so no outside asset is involved:

  F, I, R  from the FIRE label      A  from the WATER label      Y  from the PSYCHIC label

Background colour: palette index 10, which no pixel of the sheet uses, set to the Gen 6 Fairy colour (#EE99AC) by the
code that applies the icon (src/core/hw/listMenu.ts). Text uses the sheet's own indices 15 (letters) and 14 (shadow).

Output: src/core/battle/data/fairyIcon.ts (4bpp tile data, 32x16 = 8 tiles, as BlitBitmapRect4Bit expects).
Usage: python3 tools/rules/fairy_icon.py [--check] [--preview]
"""
from __future__ import annotations

import base64
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "src" / "core" / "battle" / "data" / "fairyIcon.ts"
BG_INDEX = 10
TEXT, SHADOW = 15, 14
FAIRY_RGB = (0xEE, 0x99, 0xAC)
# (icon tile offset in the sheet, {letter: component index among that icon's letters}, expected letter count)
SOURCES = {"FIRE": (0x24, {"F": 0, "I": 1, "R": 2}, 4), "WATER": (0x28, {"A": 1}, 5), "PSYCHIC": (0x84, {"Y": 2}, 6)}  # P S Y C H and "IC" touching: 6 groups


def load_sheet() -> bytes:
    idx = json.loads((ROOT / "public/fr/incbin/index.json").read_text())
    pack, off, ln = idx["symbols"]["gMenuInfoElements_Gfx"]
    return (ROOT / f"public/fr/incbin/{pack}.bin").read_bytes()[off:off + ln]


def px(sheet: bytes, x: int, y: int) -> int:
    t = (y // 8) * 16 + (x // 8)
    b = sheet[t * 32 + (y % 8) * 4 + (x % 8) // 2]
    return (b >> 4) & 15 if (x % 8) & 1 else b & 15


def letters(sheet: bytes, tile: int) -> list[dict[tuple[int, int], int]]:
    """Letters of one label as {(x, y): index}, left to right. Letters are the 8-connected groups of text pixels;
    each shadow pixel belongs to the letter pixel to its left, above or up-left (the font's drop shadow is (+1, +1))."""
    x0, y0 = (tile % 16) * 8, (tile // 16) * 8
    img = {(x, y): px(sheet, x0 + x, y0 + y) for y in range(12) for x in range(32)}
    seen: dict[tuple[int, int], int] = {}
    comps: list[list[tuple[int, int]]] = []
    for pos, v in sorted(img.items(), key=lambda kv: (kv[0][0], kv[0][1])):
        if v != TEXT or pos in seen:
            continue
        stack, comp = [pos], []
        seen[pos] = len(comps)
        while stack:
            x, y = stack.pop()
            comp.append((x, y))
            for n in ((x + dx, y + dy) for dx in (-1, 0, 1) for dy in (-1, 0, 1) if dx or dy):
                if img.get(n) == TEXT and n not in seen:
                    seen[n] = len(comps)
                    stack.append(n)
        comps.append(comp)
    comps.sort(key=lambda c: min(x for x, _ in c))
    owner = {p: i for i, c in enumerate(comps) for p in c}
    out: list[dict[tuple[int, int], int]] = [{p: TEXT for p in c} for c in comps]
    for (x, y), v in img.items():
        if v != SHADOW:
            continue
        for n in ((x - 1, y - 1), (x - 1, y), (x, y - 1)):
            if n in owner:
                out[owner[n]][(x, y)] = SHADOW
                break
        else:
            raise SystemExit(f"shadow pixel ({x},{y}) of tile {tile:#x} belongs to no letter")
    return out


def build() -> tuple[str, list[str]]:
    sheet = load_sheet()
    assert sum(px(sheet, x, y) == BG_INDEX for y in range(128) for x in range(128)) == 0, "palette index 10 is in use"
    glyphs: dict[str, dict[tuple[int, int], int]] = {}
    for name, (tile, wanted, count) in SOURCES.items():
        ls = letters(sheet, tile)
        if len(ls) != count:
            raise SystemExit(f"{name}: expected {count} letters, found {len(ls)}")
        for ch, i in wanted.items():
            g = ls[i]
            minx = min(x for x, _ in g)
            glyphs[ch] = {(x - minx, y): v for (x, y), v in g.items()}
    order = "FAIRY"
    widths = {c: max(x for x, _ in glyphs[c]) + 1 for c in order}
    total = sum(widths[c] for c in order)
    start = (32 - total) // 2
    # Label shape: the FIRE label with its text removed (rounded corners stay transparent).
    fx, fy = (0x24 % 16) * 8, (0x24 // 16) * 8
    grid = [[0 if px(sheet, fx + x, fy + y) == 0 else BG_INDEX for x in range(32)] for y in range(12)]
    x = start
    for c in order:
        for (gx, gy), v in glyphs[c].items():
            grid[gy][x + gx] = v
        x += widths[c]
    # 32x16, tile order, low nibble first
    data = bytearray(8 * 32)
    for y in range(16):
        for xx in range(32):
            v = grid[y][xx] if y < 12 else 0
            t = (y // 8) * 4 + xx // 8
            a = t * 32 + (y % 8) * 4 + (xx % 8) // 2
            data[a] |= v << (4 if (xx % 8) & 1 else 0)
    r, g, b = FAIRY_RGB
    rgb555 = ((b >> 3) << 10) | ((g >> 3) << 5) | (r >> 3)
    preview = ["".join({0: " ", BG_INDEX: ".", TEXT: "#", SHADOW: "+"}[v] for v in row) for row in grid]
    src = (
        "// GENERATED by tools/rules/fairy_icon.py -- do not edit; regenerate with that script.\n"
        "// Fairy type label for the menu-info sheet, composed from FireRed's own glyphs (F, I, R from FIRE, A from WATER,\n"
        "// Y from PSYCHIC) because neither FireRed nor Heart & Soul has one. 32x12 pixels in a 32x16, 4bpp tiled bitmap.\n"
        "// Preview ('.' background, '#' letter, '+' shadow):\n"
        + "".join(f"//   |{row}|\n" for row in preview)
        + f"export const FAIRY_ICON_TILES_B64 = \"{base64.b64encode(bytes(data)).decode()}\";\n"
        f"/** Palette index of the label background; unused by every other pixel of the sheet. */\n"
        f"export const FAIRY_ICON_PALETTE_INDEX = {BG_INDEX};\n"
        f"/** Gen 6 Fairy colour #{r:02X}{g:02X}{b:02X} as BGR555. */\n"
        f"export const FAIRY_ICON_COLOR = 0x{rgb555:04X};\n"
    )
    return src, preview


def main() -> int:
    src, preview = build()
    if "--preview" in sys.argv:
        print("\n".join(preview))
    if "--check" in sys.argv:
        if not OUT.exists() or OUT.read_text() != src:
            print("fairyIcon.ts is stale or missing; run tools/rules/fairy_icon.py")
            return 1
        print("fairyIcon.ts up to date")
        return 0
    OUT.write_text(src)
    print(f"{OUT.relative_to(ROOT)} written")
    if "--preview" not in sys.argv:
        print("\n".join(preview))
    return 0


if __name__ == "__main__":
    sys.exit(main())
