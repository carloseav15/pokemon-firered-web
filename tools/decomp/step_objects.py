"""Export overworld object graphics (people, items, field effects) and their animations."""

from __future__ import annotations

import re
from pathlib import Path

from common import DECOMP, OUT, read_jasc_palette, rgba_png, snake, write_json


def strip_comments(text: str) -> str:
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    return re.sub(r"//[^\n]*", "", text)


def parse_define_values(path: Path, prefix: str) -> dict[str, int]:
    values = {}
    for name, value in re.findall(rf"#define ({prefix}\w*)\s+([^\n/]+)", path.read_text()):
        expression = value.strip()
        for known in sorted(values, key=len, reverse=True):
            expression = expression.replace(known, str(values[known]))
        try:
            values[name] = int(eval(expression, {}, {}))
        except Exception:
            pass
    return values


def parse_anim_cmds(text: str) -> dict[str, list]:
    """Parse `static const union AnimCmd name[] = {...};` blocks."""
    anims = {}
    for name, body in re.findall(r"const union AnimCmd (\w+)\[\]\s*=\s*\{(.*?)\};", text, flags=re.S):
        cmds = []
        for cmd in re.finditer(r"ANIMCMD_(FRAME|JUMP|LOOP|END)\s*(?:\(([^)]*)\))?", body):
            kind, args = cmd.group(1), (cmd.group(2) or "")
            if kind == "FRAME":
                parts = [p.strip() for p in args.split(",")]
                positional = [p for p in parts if not p.startswith(".")]
                named = dict(p[1:].split("=", 1) for p in parts if p.startswith(".") and "=" in p)
                hflip = named.get("hFlip", "FALSE").strip() in ("TRUE", "1")
                vflip = named.get("vFlip", "FALSE").strip() in ("TRUE", "1")
                cmds.append(["F", int(positional[0], 0), int(positional[1], 0), int(hflip), int(vflip)])
            elif kind == "JUMP":
                cmds.append(["J", int(args, 0)])
            elif kind == "LOOP":
                cmds.append(["L", int(args, 0)])
            else:
                cmds.append(["E"])
        anims[name] = cmds
    return anims


def parse_anim_tables(text: str, anim_indices: dict[str, int]) -> dict[str, list]:
    tables = {}
    for name, body in re.findall(r"const union AnimCmd \*const (\w+)\[\]\s*=\s*\{(.*?)\};", text, flags=re.S):
        entries = []
        designated = re.findall(r"\[(\w+)\]\s*=\s*(\w+)", body)
        if designated:
            size = 0
            mapping = {}
            for key, value in designated:
                index = anim_indices.get(key, int(key, 0) if key[0].isdigit() else None)
                if index is None:
                    continue
                mapping[index] = value
                size = max(size, index + 1)
            entries = [mapping.get(i) for i in range(size)]
        else:
            entries = [v.strip() for v in body.split(",") if v.strip()]
        tables[name] = entries
    return tables


def export_objects(constants: dict[str, int]) -> None:
    base = DECOMP / "src/data/object_events"
    graphics_text = (base / "object_event_graphics.h").read_text()
    pics = dict(re.findall(r"(gObjectEventPic_\w+)\[\] = INCBIN_U(?:16|32)\(\"([^\"]+)\.4bpp\"\)", graphics_text))
    palettes = dict(re.findall(r"(gObjectEventPal_\w+)\[\] = INCBIN_U16\(\"([^\"]+)\.gbapal\"\)", graphics_text))
    movement_c = (DECOMP / "src/event_object_movement.c").read_text()
    palette_tags = {}
    block = re.search(r"sObjectEventSpritePalettes\[\] = \{(.*?)\};", movement_c, flags=re.S).group(1)
    for pal_symbol, tag in re.findall(r"\{(gObjectEventPal_\w+),\s*(\w+)\}", block):
        palette_tags[tag] = pal_symbol
    tag_values = parse_define_values(DECOMP / "include/event_object_movement.h", "OBJ_EVENT_PAL_TAG_")
    tag_values.update(parse_define_values(DECOMP / "include/constants/event_objects.h", "OBJ_EVENT_PAL_TAG_"))

    pic_tables = {}
    for name, body in re.findall(r"const struct SpriteFrameImage (\w+)\[\]\s*=\s*\{(.*?)\};", (base / "object_event_pic_tables.h").read_text(), flags=re.S):
        frames = []
        for match in re.finditer(r"overworld_frame\((\w+),\s*(\d+),\s*(\d+),\s*(\d+)\)|obj_frame_tiles\((\w+)\)", body):
            if match.group(1):
                frames.append([match.group(1), int(match.group(2)), int(match.group(3)), int(match.group(4))])
            else:
                frames.append([match.group(5), 0, 0, 0])
        pic_tables[name] = frames

    anim_indices = parse_define_values(DECOMP / "include/constants/event_object_movement.h", "ANIM_")
    anims_text = strip_comments((base / "object_event_anims.h").read_text())
    anim_cmds = parse_anim_cmds(anims_text)
    anim_tables = parse_anim_tables(anims_text, anim_indices)

    infos = {}
    info_text = strip_comments((base / "object_event_graphics_info.h").read_text())
    for name, body in re.findall(r"const struct ObjectEventGraphicsInfo (\w+)\s*=\s*\{(.*?)\};", info_text, flags=re.S):
        fields = {k: v.strip() for k, v in re.findall(r"\.(\w+)\s*=\s*([^,\n]+)", body)}
        infos[name] = fields
    pointers_text = strip_comments((base / "object_event_graphics_info_pointers.h").read_text())
    pointers = re.findall(r"\[(OBJ_EVENT_GFX_\w+)\]\s*=\s*&(\w+)", pointers_text)

    image_dir = OUT / "objects"
    image_dir.mkdir(parents=True, exist_ok=True)
    exported_images: dict[tuple[str, str], dict] = {}

    def export_pic(pic_symbol: str, pal_symbol: str | None):
        key = (pic_symbol, pal_symbol or "")
        if key in exported_images:
            return exported_images[key]
        source = DECOMP / (pics[pic_symbol] + ".png")
        palette = read_jasc_palette(DECOMP / (palettes[pal_symbol] + ".pal")) if pal_symbol in palettes and (DECOMP / (palettes[pal_symbol] + ".pal")).exists() else None
        stem = snake(pic_symbol.removeprefix("gObjectEventPic_")) + ("" if not pal_symbol else "__" + snake(pal_symbol.removeprefix("gObjectEventPal_")))
        width, height = rgba_png(source, image_dir / f"{stem}.png", palette)
        exported_images[key] = {"file": f"objects/{stem}.png", "width": width, "height": height}
        return exported_images[key]

    gfx = {}
    used_anims = set()
    for gfx_name, info_name in pointers:
        info = infos.get(info_name)
        if info is None:
            continue
        pal_symbol = palette_tags.get(info.get("paletteTag", ""))
        frames = []
        images = {}
        for pic_symbol, w, h, frame in pic_tables.get(info["images"], []):
            if pic_symbol not in pics:
                continue
            image = export_pic(pic_symbol, pal_symbol)
            images[pic_symbol] = image["file"]
            frames.append([image["file"], frame])
        anim_table = info.get("anims", "NULL")
        used_anims.add(anim_table)
        gfx[constants[gfx_name]] = {
            "name": gfx_name,
            "width": int(info["width"], 0),
            "height": int(info["height"], 0),
            "paletteTag": info.get("paletteTag"),
            "paletteSlot": info.get("paletteSlot"),
            "shadowSize": info.get("shadowSize"),
            "inanimate": info.get("inanimate", "FALSE") == "TRUE",
            "tracks": info.get("tracks"),
            "anims": anim_table,
            "frames": frames,
        }
    tables = {name: [entry for entry in anim_tables.get(name, [])] for name in used_anims if name in anim_tables}
    cmds_needed = {entry for table in tables.values() for entry in table if entry}
    write_json(OUT / "objects.json", {
        "gfx": gfx,
        "animTables": tables,
        "anims": {name: anim_cmds[name] for name in cmds_needed if name in anim_cmds},
    })
    print(f"  {len(gfx)} object graphics, {len(exported_images)} images")


def export_field_effect_objects(constants: dict[str, int]) -> None:
    """gFieldEffectObjectTemplate_* sprite templates (grass, shadows, splashes...) and emoticons."""
    base = DECOMP / "src/data/object_events"
    graphics_text = (base / "object_event_graphics.h").read_text()
    pics = dict(re.findall(r"(g\w+Pic_\w+)\[\] = INCBIN_U(?:16|32)\(\"([^\"]+)\.4bpp\"\)", graphics_text))
    palettes = dict(re.findall(r"(g\w+Pal\w*)\[\] = INCBIN_U16\(\"([^\"]+)\.gbapal\"\)", graphics_text))
    movement_c = (DECOMP / "src/event_object_movement.c").read_text()
    block = re.search(r"sObjectEventSpritePalettes\[\] = \{(.*?)\};", movement_c, flags=re.S).group(1)
    obj_palette_tags = {tag: sym for sym, tag in re.findall(r"\{(gObjectEventPal_\w+),\s*(\w+)\}", block)}
    tag_palettes = {
        "FLDEFF_PAL_TAG_GENERAL_0": "gFieldEffectObjectPalette0",
        "FLDEFF_PAL_TAG_GENERAL_1": "gFieldEffectObjectPalette1",
        "FLDEFF_PAL_TAG_ASH": "gFieldEffectPal_Ash",
        "FLDEFF_PAL_TAG_SMALL_SPARKLE": "gFieldEffectPal_SmallSparkle",
        "FLDEFF_PAL_TAG_CUT_GRASS": "gFieldEffectPal_CutGrass",
    }
    tag_palettes.update(obj_palette_tags)
    text = strip_comments((DECOMP / "src/data/field_effects/field_effect_objects.h").read_text())
    anim_cmds = parse_anim_cmds(text)
    anim_tables = parse_anim_tables(text, {})
    pic_tables = {}
    for name, body in re.findall(r"const struct SpriteFrameImage (\w+)\[\]\s*=\s*\{(.*?)\};", text, flags=re.S):
        frames = []
        for match in re.finditer(r"overworld_frame\((\w+),\s*(\d+),\s*(\d+),\s*(\d+)\)|obj_frame_tiles\((\w+)\)", body):
            if match.group(1):
                frames.append([match.group(1), int(match.group(2)) * 8, int(match.group(3)) * 8, int(match.group(4))])
            else:
                frames.append([match.group(5), 0, 0, 0])
        pic_tables[name] = frames
    image_dir = OUT / "fieldfx"
    image_dir.mkdir(parents=True, exist_ok=True)
    exported: dict[tuple[str, str], dict] = {}

    def export(pic: str, pal: str | None):
        key = (pic, pal or "")
        if key in exported:
            return exported[key]
        src = DECOMP / (pics[pic] + ".png")
        palette = None
        if pal and pal in palettes and (DECOMP / (palettes[pal] + ".pal")).exists():
            palette = read_jasc_palette(DECOMP / (palettes[pal] + ".pal"))
        stem = snake(pic.split("Pic_")[-1]) + ("__" + snake(pal.split("Pal")[-1]) if pal else "")
        w, h = rgba_png(src, image_dir / f"{stem}.png", palette)
        exported[key] = {"file": f"fieldfx/{stem}.png", "width": w, "height": h}
        return exported[key]

    templates = {}
    for name, body in re.findall(r"const struct SpriteTemplate (gFieldEffectObjectTemplate_\w+)\s*=\s*\{(.*?)\};", text, flags=re.S):
        fields = {k: v.strip() for k, v in re.findall(r"\.(\w+)\s*=\s*([^,\n]+)", body)}
        pal_tag = fields.get("paletteTag", "TAG_NONE")
        pal_symbol = tag_palettes.get(pal_tag, "gFieldEffectObjectPalette0")
        oam = fields.get("oam", "")
        size = re.search(r"(\d+)x(\d+)", oam)
        frames = []
        for pic, w, h, index in pic_tables.get(fields.get("images", ""), []):
            if pic not in pics:
                continue
            image = export(pic, pal_symbol)
            fw = w or image["width"]
            fh = h or image["height"]
            if size and not w:
                fw, fh = int(size.group(1)), int(size.group(2))
            frames.append([image["file"], index, fw, fh])
        anim_table = anim_tables.get(fields.get("anims", ""), [])
        templates[name.removeprefix("gFieldEffectObjectTemplate_")] = {
            "frames": frames,
            "anims": [anim_cmds.get(a, [["F", 0, 1, 0, 0], ["E"]]) for a in anim_table if a],
            "callback": fields.get("callback"),
            "size": [int(size.group(1)), int(size.group(2))] if size else None,
        }
    emoticons = rgba_png(DECOMP / "graphics/misc/emoticons.png", image_dir / "emoticons.png",
                         read_jasc_palette(DECOMP / "graphics/object_events/palettes/player.pal"))
    write_json(OUT / "fieldfx.json", {"templates": templates, "emoticons": {"file": "fieldfx/emoticons.png", "width": emoticons[0], "height": emoticons[1]}})
    print(f"  {len(templates)} field effect templates")
