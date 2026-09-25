"""Export the graphics the runtime reads as images: fonts, window frames,
door animations and the Pokémon front pics (ShowPokemonPic / field-move pics).

Everything the hardware-layer ports draw (icons, trainer/battle pics, item
icons, interface sprites, field effects) comes from the raw INCBIN exports
(step_incbin) or step_objects instead, so no PNGs are produced for it.
"""

from __future__ import annotations

import base64
import re
from pathlib import Path

from cdump import dump_json, extract_definition
from common import DECOMP, OUT, png_indices, read_jasc_palette, rgba_png, write_json

GFX = OUT / "gfx"


def pal_of(path_without_ext: str) -> list[list[int]] | None:
    """Palette for an INCBIN path such as graphics/x/y.gbapal(.lz)."""
    stem = re.sub(r"\.gbapal(\.lz)?$", "", path_without_ext)
    pal = DECOMP / (stem + ".pal")
    if pal.exists():
        return read_jasc_palette(pal)
    png = DECOMP / (stem + ".png")
    if png.exists():
        return png_indices(png)[3]
    return None


def png_for(incbin_path: str) -> Path:
    png = DECOMP / re.sub(r"\.4bpp(\.lz)?$", ".png", incbin_path)
    if not png.exists():
        alt = png.parent / "normal" / png.name
        if alt.exists():
            return alt
    return png


def export_fonts(manifest: dict) -> None:
    text_c = DECOMP / "src/text.c"
    widths_src = "\n".join(extract_definition(text_c, name) for name in (
        "sFontSmallLatinGlyphWidths", "sFontNormalLatinGlyphWidths", "sFontMaleLatinGlyphWidths", "sFontFemaleLatinGlyphWidths"))
    source = '#include "global.h"\n#include <stdio.h>\n' + widths_src + r'''
static void p(const char *n, const u8 *w, int c) { int i; printf("\"%s\":[", n); for (i = 0; i < c; i++) printf(i ? ",%d" : "%d", w[i]); printf("]"); }
int main(void) {
    printf("{");
    p("small", sFontSmallLatinGlyphWidths, sizeof(sFontSmallLatinGlyphWidths)); printf(",");
    p("normal", sFontNormalLatinGlyphWidths, sizeof(sFontNormalLatinGlyphWidths)); printf(",");
    p("male", sFontMaleLatinGlyphWidths, sizeof(sFontMaleLatinGlyphWidths)); printf(",");
    p("female", sFontFemaleLatinGlyphWidths, sizeof(sFontFemaleLatinGlyphWidths));
    printf("}");
    return 0;
}
'''
    widths = dump_json("font_widths", source)
    fonts = {}
    for key, file in (("small", "latin_small"), ("normal", "latin_normal"), ("male", "latin_male"), ("female", "latin_female")):
        w, h, indices, _ = png_indices(DECOMP / f"graphics/fonts/{file}.png")
        fonts[key] = {"width": w, "height": h, "pixels": base64.b64encode(bytes(indices)).decode(), "widths": widths[key]}
    for name in ("down_arrow_3", "down_arrow_4", "down_arrows", "keypad_icons"):
        path = DECOMP / f"graphics/fonts/{name}.png"
        if path.exists():
            w, h, indices, pal = png_indices(path)
            fonts[name] = {"width": w, "height": h, "pixels": base64.b64encode(bytes(indices)).decode(), "palette": pal[:16]}
    write_json(GFX / "fonts.json", fonts)


def export_windows(manifest: dict) -> None:
    out = {}
    for name in ["std", "signpost", "menu_message"] + [f"type{i}" for i in range(1, 11)]:
        path = DECOMP / f"graphics/text_window/{name}.png"
        w, h, indices, pal = png_indices(path)
        out[name] = {"width": w, "height": h, "pixels": base64.b64encode(bytes(indices)).decode(), "palette": pal[:16]}
    out["stdpal"] = [read_jasc_palette(DECOMP / f"graphics/text_window/stdpal_{i}.pal") for i in range(5)]
    write_json(GFX / "windows.json", out)


def export_pokemon(manifest: dict, constants: dict) -> None:
    pokemon_h = (DECOMP / "src/data/graphics/pokemon.h").read_text() + (DECOMP / "src/graphics.c").read_text()
    paths = dict(re.findall(r"(g\w+)\[\] = INCBIN_U(?:8|16|32)\(\"([^\"]+)\"\)", pokemon_h))
    tables = DECOMP / "src/data/pokemon_graphics"
    def table(file, macro):
        return re.findall(rf"{macro}\((\w+),\s*(\w+)\)", (tables / file).read_text())
    fronts = table("front_pic_table.h", "SPECIES_SPRITE")
    pals = dict(table("palette_table.h", "SPECIES_PAL"))
    shinies = dict(table("shiny_palette_table.h", "SPECIES_SHINY_PAL"))
    species_out = {}
    for name, front_sym in fronts:
        sid = constants.get(f"SPECIES_{name}")
        if sid is None:
            continue
        normal = pal_of(paths[pals[name]]) if name in pals and pals[name] in paths else None
        shiny = pal_of(paths[shinies[name]]) if name in shinies and shinies[name] in paths else None
        if front_sym not in paths:
            continue
        front_png = png_for(paths[front_sym])
        rgba_png(front_png, GFX / f"pokemon/front/{sid}.png", normal)
        if shiny:
            rgba_png(front_png, GFX / f"pokemon/front_shiny/{sid}.png", shiny)
        species_out[sid] = name
    manifest["pokemon"] = species_out


def export_doors() -> None:
    doors = {}
    for png in sorted((DECOMP / "graphics/door_anims").glob("*.png")):
        w, h, indices, _ = png_indices(png)
        doors[png.stem] = {"width": w, "height": h, "pixels": base64.b64encode(bytes(indices)).decode()}
    write_json(GFX / "doors.json", doors)

def export_graphics(constants: dict) -> None:
    manifest: dict = {}
    print("  fonts/windows")
    export_fonts(manifest)
    export_windows(manifest)
    print("  pokemon front pics")
    export_pokemon(manifest, constants)
    print("  doors")
    export_doors()
    write_json(OUT / "gfx.json", manifest)
