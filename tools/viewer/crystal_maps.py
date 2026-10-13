#!/usr/bin/env python3
"""Mapas de Pokémon Crystal para el visor: render por mapa (PNG) y eventos (JSON).

Lee el checkout fijado de pokecrystal (npm run refs:fetch -- pokecrystal) y escribe en public/crystal/
(ignorado en git; se regenera con `npm run crystal:maps`):
  public/crystal/maps.json        mapas, tileset, conexiones, warps, carteles, objetos y eventos de coordenadas
  public/crystal/maps/<Mapa>.png  mapa completo a 32 px por bloque, paleta de día

Render: bloque (4x4 tiles) -> tiles 2bpp del PNG del tileset -> paleta por tile (<tileset>_palette_map.asm)
-> colores de bg_tiles.pal elegidos por entorno y hora (data/maps/environment_colors.asm) o paleta especial
del tileset (engine/tilesets/tileset_palettes.asm). Mapas PALETTE_AUTO: <Mapa>.png = día, _morn y _nite;
mapas con paleta fija: solo <Mapa>.png con esa hora. Los tejados de pueblos/rutas de Johto
se sustituyen por gfx/tilesets/roofs/*.png con los colores de roofs.pal (data/maps/roofs.asm).
Cada mapa con objetos conocidos tiene además <Mapa>_obj.png (capa RGBA con sus sprites).
No cubre: animaciones de tiles (agua, flores), hora del día ni los sprites de Pokémon (SPRITE_POKEMON).
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "refs"))
from common import ROOT, source_path  # noqa: E402

OUT = ROOT / "public" / "crystal"
PAL_NAMES = ["GRAY", "RED", "GREEN", "WATER", "YELLOW", "BROWN", "ROOF", "TEXT"]
ROOF_TILE = 0x0A  # primer tile del tejado (9 tiles, 24x24 px)
ROOF_TILESETS = {"johto", "johto_modern"}


def rgb5(r: int, g: int, b: int) -> tuple[int, int, int]:
    return tuple((v << 3) | (v >> 2) for v in (r, g, b))  # type: ignore[return-value]


def parse_rgb_lines(text: str) -> list[list[tuple[int, int, int]]]:
    """Cada línea `RGB a,b,c, d,e,f ...` -> lista de colores 5 bits -> 8 bits."""
    rows = []
    for line in text.splitlines():
        line = line.split(";")[0]
        if "RGB" not in line:
            continue
        nums = [int(v) for v in re.findall(r"\d+", line)]
        rows.append([rgb5(*nums[i : i + 3]) for i in range(0, len(nums), 3)])
    return rows


TIMES = ["morn", "day", "nite", "dark"]
ENV_GROUP = {"TOWN": "Outdoor", "ROUTE": "Outdoor", "INDOOR": "Indoor", "GATE": "Indoor", "CAVE": "Dungeon",
             "DUNGEON": "Dungeon", "ENVIRONMENT_5": "Env5"}
SPECIAL_PAL = {  # tileset -> .pal fijo de 8 paletas (LoadSpecialMapPalette)
    "pokecom_center": "pokecom_center.pal",
    "battle_tower_inside": "battle_tower_inside.pal",
    "ice_path": "ice_path.pal",
    "house": "house.pal",
    "radio_tower": "radio_tower.pal",
}


def env_colors(src: Path) -> dict[str, list[list[int]]]:
    """data/maps/environment_colors.asm: grupo -> [morn, day, nite, dark] -> 8 índices de bg_tiles.pal."""
    text = (src / "data/maps/environment_colors.asm").read_text()
    out: dict[str, list[list[int]]] = {}
    for name, body in re.findall(r"^\.(\w+)Colors:\n((?:\s*db [^\n]+\n)+)", text, re.M):
        rows = [[int(v, 16) for v in re.findall(r"\$([0-9a-fA-F]{2})", line)] for line in body.strip().splitlines()]
        out[name] = rows
    return out


def load_palettes(src: Path, gfx: Path, tileset: str, env: str, time: str) -> list[list[tuple[int, int, int]]]:
    """Las 8 paletas de fondo de un mapa a una hora (LoadMapPals; las especiales ignoran la hora)."""
    special = SPECIAL_PAL.get(tileset)
    if tileset == "ice_path" and env == "INDOOR":  # Hall of Fame
        special = None
    if special:
        flat = [c for r in parse_rgb_lines((gfx / special).read_text()) for c in r]
        return [flat[i : i + 4] for i in range(0, 32, 4)]
    if tileset == "mansion":
        def one(name: str) -> list[list[tuple[int, int, int]]]:
            flat = [c for r in parse_rgb_lines((gfx / name).read_text()) for c in r]
            return [flat[i : i + 4] for i in range(0, len(flat), 4)]
        m1, m2 = one("mansion_1.pal"), one("mansion_2.pal")
        pals = [list(p) for p in m1[:8]]
        pals[4] = list(m2[0])  # PAL_BG_YELLOW
        pals[3] = list(m1[6])  # PAL_BG_WATER
        pals[6] = list(m1[8])  # PAL_BG_ROOF
        return pals
    rows = parse_rgb_lines((gfx / "bg_tiles.pal").read_text())
    indices = env_colors(src)[ENV_GROUP[env]][TIMES.index(time)]
    return [list(rows[i]) for i in indices]


def parse_palette_map(path: Path) -> list[tuple[int, int]]:
    """_palette_map.asm -> 256 entradas (banco VRAM, paleta); 0xE0-0xFF sin definir."""
    out: list[tuple[int, int]] = []
    rept = 1
    for raw in path.read_text().splitlines():
        line = raw.split(";")[0].strip()
        if not line:
            continue
        m = re.match(r"rept\s+(\d+)", line)
        if m:
            rept = int(m.group(1))
            continue
        if line.startswith("endr"):
            rept = 1
            continue
        m = re.match(r"tilepal\s+(\d+)\s*,\s*(.+)", line)
        if m:
            bank = int(m.group(1))
            for name in (s.strip() for s in m.group(2).split(",")):
                out.append((bank, PAL_NAMES.index(name)))
            continue
        m = re.match(r"db\s+\$([0-9a-fA-F]{2})", line)
        if m:
            v = int(m.group(1), 16)
            for _ in range(rept):
                out.extend([(0, v & 7), (0, (v >> 4) & 7)])
            continue
        raise SystemExit(f"{path.name}: línea no reconocida: {line!r}")
    if len(out) != 224:  # 0x00-0x5F banco 0, 0x60-0x7F texto, 0x80-0xDF banco 1
        raise SystemExit(f"{path.name}: {len(out)} entradas de paleta, se esperaban 224")
    return out + [(0, 7)] * 32


def load_tiles(png: Path) -> list[list[int]]:
    """PNG gris 128xN -> lista de tiles 8x8 con índices 0..3 (0 = más claro)."""
    im = Image.open(png).convert("L")
    w, h = im.size
    px = im.load()
    tiles = []
    for ty in range(h // 8):
        for tx in range(w // 8):
            tiles.append([3 - min(3, px[tx * 8 + x, ty * 8 + y] // 64) for y in range(8) for x in range(8)])
    return tiles


def map_groups(src: Path) -> dict[str, int]:
    """Nombre de mapa -> número de grupo (1..), por el orden de MapGroupPointers y los bloques MapGroup_*."""
    text = (src / "data/maps/maps.asm").read_text()
    order = re.findall(r"dw (MapGroup_\w+)", text)
    groups: dict[str, int] = {}
    for gi, label in enumerate(order, 1):
        m = re.search(rf"^{label}:\n(.*?)(?=^MapGroup_\w+:|\Z)", text, re.S | re.M)
        if not m:
            continue
        for name in re.findall(r"^\s*map\s+(\w+)\s*,", m.group(1), re.M):
            groups[name] = gi
    return groups


def roofs(src: Path) -> tuple[list[int], list[tuple[list, list]]]:
    """MapGroupRoofs (por grupo) y los colores de roofs.pal (día) por grupo."""
    text = (src / "data/maps/roofs.asm").read_text()
    names = re.findall(r"const (ROOF_\w+)", text)
    table = re.search(r"MapGroupRoofs:(.*?)assert_table_length", text, re.S)
    assert table
    ids = []
    for v in re.findall(r"db\s+(-1|ROOF_\w+)", table.group(1)):
        ids.append(-1 if v == "-1" else names.index(v))
    pal_text = (src / "gfx/tilesets/roofs.pal").read_text()
    day = []
    for chunk in re.split(r"; group \d+", pal_text)[1:]:
        rows = parse_rgb_lines(chunk)
        day.append((rows[0], rows[1]))  # (morn/day, nite)
    return ids, day


def events(path: Path, const_to_name: dict[str, str]) -> dict[str, list]:
    warps, bgs, objs, coords = [], [], [], []
    if not path.exists():
        return {"warps": warps, "bgs": bgs, "objects": objs, "coords": coords}
    for raw in path.read_text().splitlines():
        line = raw.split(";")[0].strip()
        m = re.match(r"warp_event\s+(\d+)\s*,\s*(\d+)\s*,\s*(\w+)\s*,\s*(-?\d+)", line)
        if m:
            dest = m.group(3)
            warps.append({"x": int(m.group(1)), "y": int(m.group(2)), "dest": const_to_name.get(dest, dest), "destConst": dest, "warp": int(m.group(4))})
            continue
        m = re.match(r"bg_event\s+(\d+)\s*,\s*(\d+)\s*,\s*(\w+)\s*,\s*(\w+)", line)
        if m:
            bgs.append({"x": int(m.group(1)), "y": int(m.group(2)), "kind": m.group(3), "script": m.group(4)})
            continue
        m = re.match(r"coord_event\s+(\d+)\s*,\s*(\d+)\s*,\s*(-?\w+)\s*,\s*(\w+)", line)
        if m:
            coords.append({"x": int(m.group(1)), "y": int(m.group(2)), "scene": m.group(3), "script": m.group(4)})
            continue
        m = re.match(r"object_event\s+(\d+)\s*,\s*(\d+)\s*,\s*(\w+)\s*,\s*(\w+)\s*,[^,]*,[^,]*,[^,]*,[^,]*,\s*(\w+)\s*,\s*(\w+)\s*,\s*([^,]+),\s*(\w+)\s*,\s*(-?\w+)", line)
        if m:
            objs.append({"x": int(m.group(1)), "y": int(m.group(2)), "sprite": m.group(3), "move": m.group(4), "pal": m.group(5), "type": m.group(6), "script": m.group(8), "flag": m.group(9)})
    return {"warps": warps, "bgs": bgs, "objects": objs, "coords": coords}


def load_object_sprites(src: Path) -> dict[str, dict]:
    """SPRITE_* -> {frames: [índices 2bpp 16x16...], pal: índice por defecto, w, h}."""
    consts = []
    for line in (src / "constants/sprite_constants.asm").read_text().splitlines():
        if "NUM_OVERWORLD_SPRITES" in line:
            break
        m = re.match(r"\s*const\s+(SPRITE_\w+)", line)
        if m:
            consts.append(m.group(1))
    entries = re.findall(r"overworld_sprite\s+(\w+)\s*,\s*(\d+)\s*,\s*(\w+)\s*,\s*PAL_OW_(\w+)", (src / "data/sprites/sprites.asm").read_text())
    files = dict(re.findall(r'^(\w+)::\s*INCBIN "gfx/sprites/([\w]+)\.2bpp"', (src / "gfx/sprites.asm").read_text(), re.M))
    names = ["RED", "BLUE", "GREEN", "BROWN", "PINK", "EMOTE", "TREE", "ROCK"]
    out = {}
    for const, (label, _tiles, _type, pal) in zip(consts[1:], entries):
        png = src / "gfx/sprites" / f"{files[label]}.png"
        im = Image.open(png).convert("L")
        w, h = im.size
        px = im.load()
        scale = 1 if im.getextrema()[1] > 3 else 85  # PNG de 2 bits: PIL entrega 0..3 sin escalar
        out[const] = {"w": w, "h": h, "pal": names.index(pal),
                      "px": [[3 - min(3, px[x, y] * scale // 64) for x in range(w)] for y in range(h)]}
    return out


def object_palettes(src: Path) -> dict[str, list[list[tuple[int, int, int]]]]:
    """npc_sprites.pal: 8 paletas por hora (morn, day, nite, dark)."""
    rows = parse_rgb_lines((src / "gfx/overworld/npc_sprites.pal").read_text())
    return {t: rows[i * 8 : i * 8 + 8] for i, t in enumerate(TIMES)}


FACING_FRAME = {"down": 0, "up": 1, "left": 2, "right": 2}


def facing(move: str) -> str:
    m = move.removeprefix("SPRITEMOVEDATA_")
    if m.endswith("_UP") or m == "STANDING_UP":
        return "up"
    if m.endswith("_LEFT") or m in ("WALK_LEFT_RIGHT",):
        return "left"
    if m.endswith("_RIGHT"):
        return "right"
    return "down"


def object_layer(objs: list[dict], w: int, h: int, sprites: dict, pals: list) -> Image.Image | None:
    layer = Image.new("RGBA", (w * 32, h * 32), (0, 0, 0, 0))
    drawn = 0
    for o in objs:
        spr = sprites.get(o["sprite"])
        if not spr:
            continue
        pal_name = o.get("pal", "0")
        pal = spr["pal"]
        if pal_name.startswith("PAL_NPC_"):
            pal = ["RED", "BLUE", "GREEN", "BROWN", "PINK", "EMOTE", "TREE", "ROCK"].index(pal_name.removeprefix("PAL_NPC_"))
        colors = pals[pal]
        sw, sh = spr["w"], spr["h"]
        if sw == 16:
            frames = max(1, sh // 16)
            face = facing(o["move"])
            fi = FACING_FRAME[face] if frames > 1 else 0
            fi = min(fi, frames - 1)
            box = (0, fi * 16, 16, fi * 16 + 16)
            flip = face == "right" and frames > 1
        else:  # sprites grandes (Snorlax, Lapras...): imagen completa
            box = (0, 0, sw, sh)
            flip = False
        fw, fh = box[2] - box[0], box[3] - box[1]
        img = Image.new("RGBA", (fw, fh), (0, 0, 0, 0))
        out = img.load()
        for yy in range(fh):
            for xx in range(fw):
                v = spr["px"][box[1] + yy][box[0] + xx]
                if v:
                    out[xx, yy] = colors[v] + (255,)
        if flip:
            img = img.transpose(Image.FLIP_LEFT_RIGHT)
        layer.alpha_composite(img, (o["x"] * 16, o["y"] * 16 - 4)) if o["y"] * 16 - 4 >= 0 else layer.alpha_composite(img.crop((0, 4, fw, fh)), (o["x"] * 16, 0))
        drawn += 1
    return layer if drawn else None


def render_map(m: dict, ts: dict, tiles: list, pmap: list, pals: list) -> Image.Image:
    w, h = m["width"], m["height"]
    img = Image.new("RGB", (w * 32, h * 32), (0, 0, 0))
    out = img.load()
    for by in range(h):
        for bx in range(w):
            blk = ts["blocks"][m["blocks"][by][bx]] if m["blocks"][by][bx] < len(ts["blocks"]) else [0] * 16
            for i, tid in enumerate(blk):
                _bank, pal = pmap[tid]
                if tid < 0x60:
                    data = tiles[tid] if tid < len(tiles) else None
                elif 0x80 <= tid < 0xE0:
                    gi = 96 + tid - 0x80
                    data = tiles[gi] if gi < len(tiles) else None
                else:
                    data = None  # 0x60-0x7F y 0xE0-0xFF: texto/gráficos comunes fuera del tileset
                col = pals[pal]
                ox = bx * 32 + (i % 4) * 8
                oy = by * 32 + (i // 4) * 8
                for p in range(64):
                    out[ox + p % 8, oy + p // 8] = col[data[p]] if data else col[0]
    return img


def main() -> None:
    src = source_path("pokecrystal")
    maps = json.loads((ROOT / "refs/crystal/maps.json").read_text())["data"]
    tilesets = {t["name"]: t for t in json.loads((ROOT / "refs/crystal/tilesets.json").read_text())["data"]}
    gfx = src / "gfx/tilesets"
    groups = map_groups(src)
    roof_by_group, roof_pal = roofs(src)

    # map_const (orden de la tabla de mapas) -> nombre
    consts = re.findall(r"^\s*map_const\s+(\w+)\s*,", (src / "constants/map_constants.asm").read_text(), re.M)
    maps_asm = (src / "data/maps/maps.asm").read_text()
    order = re.findall(r"^\s*map\s+(\w+)\s*,\s*TILESET_", maps_asm, re.M)
    if len(consts) != len(order):
        raise SystemExit(f"{len(consts)} constantes de mapa frente a {len(order)} mapas")
    const_to_name = dict(zip(consts, order))
    # 7.º argumento de `map`: PALETTE_AUTO (hora real) / DAY / NITE / DARK fijos
    palette_of = {n: p for n, p in re.findall(r"^\s*map\s+(\w+)\s*,\s*TILESET_\w+\s*,\s*\w+\s*,\s*LANDMARK_\w+\s*,\s*MUSIC_\w+\s*,\s*\w+\s*,\s*PALETTE_(\w+)", maps_asm, re.M)}

    sprites = load_object_sprites(src)
    npc_pals = object_palettes(src)
    cache: dict[str, tuple[list[list[int]], list[tuple[int, int]]]] = {}
    (OUT / "maps").mkdir(parents=True, exist_ok=True)
    for old in (OUT / "maps").glob("*.png"):
        old.unlink()
    result = []
    problems = []
    for m in maps:
        ts_name = m["tileset"].removeprefix("TILESET_").lower()
        if ts_name not in cache:
            png = gfx / f"{ts_name}.png"
            if not png.exists():
                problems.append(f"{m['name']}: sin PNG de tileset {ts_name}")
                continue
            cache[ts_name] = (load_tiles(png), parse_palette_map(gfx / f"{ts_name}_palette_map.asm"))
        base_tiles, pmap = cache[ts_name]
        tiles = [list(t) for t in base_tiles]
        group = groups.get(m["name"], 0)
        roof = roof_by_group[group - 1] if 0 < group <= len(roof_by_group) else -1
        outdoors = m["environment"] in ("TOWN", "ROUTE")
        if ts_name in ROOF_TILESETS and roof >= 0 and outdoors:
            roof_name = ["new_bark", "violet", "azalea", "olivine", "goldenrod"][roof]
            rt = load_tiles(gfx / "roofs" / f"{roof_name}.png")
            # 24x24 -> 3x3 tiles; se colocan en ROOF_TILE.. (orden de lectura del PNG)
            for i, t in enumerate(rt[:9]):
                tiles[ROOF_TILE + i] = t

        palette = palette_of.get(m["name"], "AUTO")
        default = {"AUTO": "day", "DAY": "day", "NITE": "nite", "DARK": "dark"}[palette]
        times = ["morn", "day", "nite"] if palette == "AUTO" else [default]
        ts = tilesets[ts_name]
        w, h = m["width"], m["height"]
        ev = events(src / "maps" / f"{m['name']}.asm", const_to_name)
        obj_variants = []
        base_layer_bytes = None
        for t in times:
            pals = [list(p) for p in load_palettes(src, gfx, ts_name, m["environment"], t)]
            if outdoors and 0 < group <= len(roof_pal):  # LoadMapPals: color 1-2 del tejado (nite también en dark)
                c = roof_pal[group - 1][1 if t in ("nite", "dark") else 0]
                pals[6][1], pals[6][2] = c[0], c[1]
            img = render_map(m, ts, tiles, pmap, pals)
            suffix = "" if t == default else f"_{t}"
            img.save(OUT / "maps" / f"{m['name']}{suffix}.png", optimize=True)
            layer = object_layer(ev["objects"], w, h, sprites, npc_pals[t])
            if layer is None:
                continue
            raw = layer.tobytes()
            if t == default:
                base_layer_bytes = raw
                layer.save(OUT / "maps" / f"{m['name']}_obj.png", optimize=True)
        # capas de objetos que difieren de la base (paletas de árbol y roca cambian con la hora)
        if base_layer_bytes is not None:
            for t in times:
                if t == default:
                    continue
                layer = object_layer(ev["objects"], w, h, sprites, npc_pals[t])
                if layer is not None and layer.tobytes() != base_layer_bytes:
                    layer.save(OUT / "maps" / f"{m['name']}_obj_{t}.png", optimize=True)
                    obj_variants.append(t)
        ev["objLayer"] = base_layer_bytes is not None
        ev["objTimes"] = obj_variants
        result.append({
            "name": m["name"], "w": w, "h": h, "tileset": ts_name, "environment": m["environment"],
            "landmark": m["landmark"].removeprefix("LANDMARK_"), "music": m["music"].removeprefix("MUSIC_"),
            "group": group, "palette": palette, "default": default, "times": times,
            "connections": m["connections"], **ev,
        })
    (OUT / "maps.json").write_text(json.dumps({"maps": result, "commit": json.loads((ROOT / "tools/refs/sources.json").read_text())["pokecrystal"]["commit"]}, separators=(",", ":")) + "\n")
    print(f"{len(result)} mapas, {len(cache)} tilesets, {sum(len(r['warps']) for r in result)} warps, {sum(1 for r in result if len(r['times']) > 1)} con hora del día")
    for p in problems:
        print("aviso:", p)


if __name__ == "__main__":
    main()
