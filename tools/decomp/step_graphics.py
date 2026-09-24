"""Export sprites, fonts, windows and battle graphics."""

from __future__ import annotations

import base64
import re
from pathlib import Path

from PIL import Image

from cdump import dump_json, extract_definition
from common import DECOMP, OUT, png_indices, read_jasc_palette, rgba_png, snake, write_json

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


def render_tilemap(tiles_png: Path, tilemap: bytes, palettes: list[list[int]], width_tiles: int, out: Path,
                   pal_base: int = 0, tile_base: int = 0, transparent: bool = False, crop: tuple[int, int] | None = None) -> None:
    """Compose a GBA 4bpp text-mode tilemap into an RGBA image."""
    tw, th, indices, _ = png_indices(tiles_png)
    tiles_per_row = tw // 8
    count = len(tilemap) // 2
    height_tiles = count // width_tiles
    image = Image.new("RGBA", (width_tiles * 8, height_tiles * 8))
    px = image.load()
    for n in range(count):
        entry = tilemap[n * 2] | (tilemap[n * 2 + 1] << 8)
        tile = (entry & 0x3FF) - tile_base
        hflip = entry & 0x400
        vflip = entry & 0x800
        pal = (entry >> 12) - pal_base
        if tile < 0 or tile >= tiles_per_row * (th // 8):
            continue
        sx = (tile % tiles_per_row) * 8
        sy = (tile // tiles_per_row) * 8
        dx = (n % width_tiles) * 8
        dy = (n // width_tiles) * 8
        for y in range(8):
            for x in range(8):
                ix = 7 - x if hflip else x
                iy = 7 - y if vflip else y
                index = indices[(sy + iy) * tw + sx + ix] & 0xF
                if index == 0 and transparent:
                    continue
                color_index = pal * 16 + index
                color = palettes[color_index] if 0 <= color_index < len(palettes) else [255, 0, 255]
                px[dx + x, dy + y] = (color[0], color[1], color[2], 255)
    if crop:
        image = image.crop((0, 0, crop[0], crop[1]))
    out.parent.mkdir(parents=True, exist_ok=True)
    image.save(out, optimize=True)


def flat_palette(path: Path) -> list[list[int]]:
    return read_jasc_palette(path)


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
    backs = table("back_pic_table.h", "SPECIES_SPRITE")
    pals = dict(table("palette_table.h", "SPECIES_PAL"))
    shinies = dict(table("shiny_palette_table.h", "SPECIES_SHINY_PAL"))
    icon_c = (DECOMP / "src/pokemon_icon.c").read_text()
    icons = dict(re.findall(r"\[SPECIES_(\w+)\]\s*=\s*(gMonIcon_\w+)", icon_c))
    icon_indices_block = re.search(r"gMonIconPaletteIndices\[\] = \{(.*?)\};", icon_c, flags=re.S).group(1)
    icon_indices = {k: int(v) for k, v in re.findall(r"\[SPECIES_(\w+)\]\s*=\s*(\d+)", icon_indices_block)}
    icon_palettes = [read_jasc_palette(DECOMP / f"graphics/pokemon/icon_palettes/icon_palette_{i}.pal") for i in range(3)]
    species_out = {}
    back_map = dict(backs)
    for name, front_sym in fronts:
        sid = constants.get(f"SPECIES_{name}")
        if sid is None:
            continue
        entry = {}
        normal = pal_of(paths[pals[name]]) if name in pals and pals[name] in paths else None
        shiny = pal_of(paths[shinies[name]]) if name in shinies and shinies[name] in paths else None
        if front_sym not in paths:
            continue
        front_png = png_for(paths[front_sym])
        rgba_png(front_png, GFX / f"pokemon/front/{sid}.png", normal)
        if shiny:
            rgba_png(front_png, GFX / f"pokemon/front_shiny/{sid}.png", shiny)
        back_sym = back_map.get(name)
        if back_sym and back_sym in paths:
            back_png = png_for(paths[back_sym])
            rgba_png(back_png, GFX / f"pokemon/back/{sid}.png", normal)
            if shiny:
                rgba_png(back_png, GFX / f"pokemon/back_shiny/{sid}.png", shiny)
        icon_sym = icons.get(name)
        if icon_sym and icon_sym in paths:
            icon_png = png_for(paths[icon_sym])
            rgba_png(icon_png, GFX / f"pokemon/icon/{sid}.png", icon_palettes[icon_indices.get(name, 0)])
        species_out[sid] = name
    manifest["pokemon"] = species_out


def export_trainers(manifest: dict, constants: dict) -> None:
    trainers_h = (DECOMP / "src/data/graphics/trainers.h").read_text() + (DECOMP / "src/graphics.c").read_text()
    paths = dict(re.findall(r"(g\w+)\[\] = INCBIN_U(?:8|16|32)\(\"([^\"]+)\"\)", trainers_h))
    tables = DECOMP / "src/data/trainer_graphics"
    front_text = (tables / "front_pic_tables.h").read_text()
    fronts = re.findall(r"TRAINER_SPRITE\((\w+),\s*(\w+),", front_text)
    pals = dict(re.findall(r"TRAINER_PAL\((\w+),\s*(\w+)\)", front_text))
    coords_block = re.search(r"gTrainerFrontPicCoords\[\] =\s*\{(.*?)\};", front_text, flags=re.S).group(1)
    coords = [[int(a), int(b)] for a, b in re.findall(r"\.size = (\d+), \.y_offset = (\d+)", coords_block)]
    out_front = {}
    for index, (name, sym) in enumerate(fronts):
        pic_id = constants.get(f"TRAINER_PIC_{name}", index)
        png = DECOMP / re.sub(r"\.4bpp(\.lz)?$", ".png", paths[sym])
        palette = pal_of(paths[pals[name]]) if pals.get(name) in paths else None
        rgba_png(png, GFX / f"trainers/front/{pic_id}.png", palette)
        out_front[pic_id] = {"name": name, "coords": coords[index] if index < len(coords) else [8, 0]}
    back_text = (tables / "back_pic_tables.h").read_text()
    back_syms = re.findall(r"\{ \(const u32 \*\)(\w+), 0x[0-9a-fA-F]+, (\d+) \}", back_text)
    back_pals = dict((int(i), s) for s, i in re.findall(r"\{ (\w+), (\d+) \}", back_text.split("gTrainerBackPicPaletteTable")[1]))
    out_back = {}
    for sym, index in back_syms:
        index = int(index)
        if sym not in paths:
            continue
        png = DECOMP / re.sub(r"\.4bpp(\.lz)?$", ".png", paths[sym])
        palette = pal_of(paths[back_pals[index]]) if back_pals.get(index) in paths else None
        w, h = rgba_png(png, GFX / f"trainers/back/{index}.png", palette)
        out_back[index] = {"width": w, "height": h}
    manifest["trainers"] = {"front": out_front, "back": out_back}


def export_battle(manifest: dict) -> None:
    bi = DECOMP / "graphics/battle_interface"
    healthbox_pal = read_jasc_palette(bi / "healthbox.pal")
    for name in ("healthbox_singles_player", "healthbox_singles_opponent", "healthbox_doubles_player", "healthbox_doubles_opponent", "healthbox_safari", "party_summary_bar", "level_up_banner"):
        rgba_png(bi / f"{name}.png", GFX / f"battle/{name}.png", healthbox_pal)
    rgba_png(bi / "healthbox_elements.png", GFX / "battle/healthbox_elements.png", read_jasc_palette(bi / "healthbar.pal"))
    rgba_png(bi / "enemy_mon_shadow.png", GFX / "battle/enemy_mon_shadow.png", healthbox_pal)
    textbox_pal = read_jasc_palette(bi / "textbox1.pal") + read_jasc_palette(bi / "textbox2.pal")
    render_tilemap(bi / "textbox.png", (bi / "textbox.bin").read_bytes(), textbox_pal, 32, GFX / "battle/textbox.png")
    manifest["battle"] = {"textboxPalette": textbox_pal}
    terrains = {}
    for folder in sorted((DECOMP / "graphics/battle_terrain").iterdir()):
        if not folder.is_dir() or not (folder / "terrain.png").exists():
            continue
        if not (folder / "terrain.pal").exists():
            for variant in sorted(folder.glob("*.pal")):
                pal = read_jasc_palette(variant)
                render_tilemap(folder / "terrain.png", (folder / "terrain.bin").read_bytes(), pal, 32, GFX / f"battle/terrain_{folder.name}_{variant.stem}.png", pal_base=2)
                terrains[f"{folder.name}_{variant.stem}"] = True
            continue
        pal = read_jasc_palette(folder / "terrain.pal")
        render_tilemap(folder / "terrain.png", (folder / "terrain.bin").read_bytes(), pal, 32, GFX / f"battle/terrain_{folder.name}.png", pal_base=2)
        if (folder / "anim.png").exists() and (folder / "anim.bin").exists():
            anim = (folder / "anim.bin").read_bytes()
            render_tilemap(folder / "anim.png", anim, pal, 32, GFX / f"battle/terrain_{folder.name}_entry.png", pal_base=2, transparent=True)
        terrains[folder.name] = True
    manifest["battle"]["terrains"] = list(terrains)
    # Poke Ball sprites used in battle and the party/summary UI.
    interface = DECOMP / "graphics/interface"
    for png in sorted(interface.glob("ball_*.png")) + sorted((DECOMP / "graphics/interface").glob("*ball*.png")):
        pal = png.with_suffix(".pal")
        rgba_png(png, GFX / f"interface/{png.stem}.png", read_jasc_palette(pal) if pal.exists() else None)


def export_field_effects(manifest: dict) -> None:
    source = DECOMP / "graphics/field_effects/pics"
    effects_c = (DECOMP / "src/data/field_effects/field_effect_objects.h").read_text() if (DECOMP / "src/data/field_effects/field_effect_objects.h").exists() else ""
    palettes_dir = DECOMP / "graphics/field_effects/palettes"
    general = read_jasc_palette(palettes_dir / "general_0.pal") if (palettes_dir / "general_0.pal").exists() else None
    out = {}
    for png in sorted(source.glob("*.png")):
        w, h = rgba_png(png, GFX / f"fieldfx/{png.stem}.png", None)
        out[png.stem] = [w, h]
    for pal in sorted(palettes_dir.glob("*.pal")):
        out.setdefault("_palettes", {})[pal.stem] = read_jasc_palette(pal)
    doors = {}
    for png in sorted((DECOMP / "graphics/door_anims").glob("*.png")):
        w, h, indices, _ = png_indices(png)
        doors[png.stem] = {"width": w, "height": h, "pixels": base64.b64encode(bytes(indices)).decode()}
    write_json(GFX / "doors.json", doors)
    manifest["fieldEffects"] = out


def export_items_icons(manifest: dict, constants: dict) -> None:
    items_h = (DECOMP / "src/data/graphics/items.h").read_text() + (DECOMP / "src/graphics.c").read_text()
    paths = dict(re.findall(r"(g\w+)\[\] = INCBIN_U(?:8|16|32)\(\"([^\"]+)\"\)", items_h))
    table_text = (DECOMP / "src/data/item_icon_table.h").read_text()
    entries = re.findall(r"\[(ITEM_\w+)\]\s*=\s*\{(\w+),\s*(\w+)\}", table_text)
    out = {}
    done = {}
    for item, icon, pal in entries:
        if icon not in paths or pal not in paths:
            continue
        key = (icon, pal)
        if key not in done:
            png = DECOMP / re.sub(r"\.4bpp(\.lz)?$", ".png", paths[icon])
            palette = pal_of(paths[pal])
            name = snake(icon.removeprefix("gItemIcon_")) + "__" + snake(pal.removeprefix("gItemIconPalette_"))
            rgba_png(png, GFX / f"items/{name}.png", palette)
            done[key] = name
        if item in constants:
            out[constants[item]] = done[key]
    manifest["itemIcons"] = out


def export_graphics(constants: dict) -> None:
    manifest: dict = {}
    print("  fonts/windows")
    export_fonts(manifest)
    export_windows(manifest)
    print("  pokemon")
    export_pokemon(manifest, constants)
    print("  trainers")
    export_trainers(manifest, constants)
    print("  battle")
    export_battle(manifest)
    print("  field effects/doors")
    export_field_effects(manifest)
    print("  item icons")
    export_items_icons(manifest, constants)
    write_json(OUT / "gfx.json", manifest)
