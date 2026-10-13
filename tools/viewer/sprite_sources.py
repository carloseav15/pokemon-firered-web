#!/usr/bin/env python3
"""Sprites de otros juegos para el dex del visor: PMD Red, pokeemerald-expansion, Platinum y HeartGold.

Lee los checkouts fijados en tools/refs/sources.json (npm run refs:fetch) y escribe en
public/sprites/<fuente>/ más public/sprites/index.json (nacional -> fuentes -> elementos).
Los gráficos no van en refs/ (regla 5 de refs/README.md); el juego no los usa.

Uso: python3 tools/viewer/sprite_sources.py [fuente ...]
Fuentes: pmd-red, emerald-expansion, platinum, heartgold, crystal, pmd-sky (sin argumentos: todas).

PMD Red: cada especie son piezas OAM (graphics/ax/mon/<especie>/sprite_N[_k].png) más poses y animaciones
en src/data/ax/<especie>.h. Se componen las poses (tiles 8x8 en orden 1D de OBJ, flips, prioridad por
índice OAM) en un atlas por especie y se escribe el JSON de animaciones tal cual está en el C.
"""

from __future__ import annotations

import csv
import hashlib
import json
import re
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "refs"))
from common import ROOT, source_path  # noqa: E402

OUT = ROOT / "public" / "sprites"
SOURCE_INFO = {
    "pmd-red": {"label": "Pokémon Mystery Dungeon: Red Rescue Team", "repo": "pret/pmd-red", "pin": "pmd-red"},
    "emerald-expansion": {"label": "pokeemerald-expansion", "repo": "rh-hideout/pokeemerald-expansion", "pin": "pokeemerald-expansion"},
    "platinum": {"label": "Pokémon Platinum", "repo": "pret/pokeplatinum", "pin": "pokeplatinum"},
    "heartgold": {"label": "Pokémon HeartGold", "repo": "pret/pokeheartgold", "pin": "pokeheartgold"},
    "crystal": {"label": "Pokémon Crystal", "repo": "pret/pokecrystal", "pin": "pokecrystal"},
    "pmd-sky": {"label": "Pokémon Mystery Dungeon: Explorers of Sky (retratos)", "repo": "pret/pmd-sky", "pin": "pmd-sky"},
}


def norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", s.lower())


def species_names() -> dict[int, str]:
    src = source_path("pokeapi") / "data/v2/csv/pokemon_species.csv"
    with src.open() as f:
        return {int(r["id"]): r["identifier"] for r in csv.DictReader(f)}


def species_table() -> dict[str, int]:
    src = source_path("pokeapi") / "data/v2/csv/pokemon_species.csv"
    with src.open() as f:
        return {norm(r["identifier"]): int(r["id"]) for r in csv.DictReader(f)}


def resolve(dirname: str, table: dict[str, int]) -> tuple[int, str] | None:
    """Carpeta de especie/forma -> (nacional, forma). Prefijo más largo que sea una especie."""
    toks = dirname.split("_")
    for k in range(len(toks), 0, -1):
        n = table.get(norm("".join(toks[:k])))
        if n:
            return n, "_".join(toks[k:])
    # Sin guiones (castformrainy, unowna): especie más larga que sea prefijo del nombre normalizado.
    flat = norm(dirname)
    best = max((k for k in table if flat.startswith(k) and len(k) >= 3), key=len, default=None)
    if best:
        return table[best], flat[len(best):]
    return None


def read_pal(path: Path) -> list[int]:
    t = path.read_text().split()
    if t[0] != "JASC-PAL":
        raise SystemExit(f"{path}: no es JASC-PAL")
    n = int(t[2])
    flat = [int(v) for v in t[3 : 3 + n * 3]]
    return flat + [0] * (768 - len(flat))


def save_indexed(img: Image.Image, dst: Path, pal: list[int] | None = None) -> None:
    if img.mode != "P":
        raise SystemExit(f"{dst}: se esperaba una imagen indexada, es {img.mode}")
    img = img.copy()
    if pal is not None:
        img.putpalette(pal)
    dst.parent.mkdir(parents=True, exist_ok=True)
    img.save(dst, optimize=True, transparency=0)


def rel(p: Path) -> str:
    return "/" + str(p.relative_to(ROOT / "public"))


def frames_of(w: int, h: int) -> tuple[int, str, int, int]:
    """Hojas de dos fotogramas: 2w=h vertical, w=2h horizontal; si no, imagen única."""
    if h == 2 * w:
        return 2, "y", w, w
    if w == 2 * h:
        return 2, "x", h, h
    return 1, "", w, h


def item(label: str, url: Path, img: Image.Image, kind: str | None = None) -> dict:
    w, h = img.size
    n, axis, fw, fh = frames_of(w, h)
    if kind == "icon":
        n, axis, fw, fh = (2, "y", w, w) if h == 2 * w else (1, "", w, h)
    d: dict = {"label": label, "url": rel(url), "w": w, "h": h}
    if n > 1:
        d.update({"n": n, "axis": axis, "fw": fw, "fh": fh})
    return d


# ---------------------------------------------------------------- pokeemerald-expansion

def build_expansion(table: dict[str, int]) -> dict[int, list[dict]]:
    root = source_path("pokeemerald-expansion") / "graphics/pokemon"
    out: dict[int, list[dict]] = {}
    skipped = []
    for d in sorted(p for p in root.iterdir() if p.is_dir()):
        r = resolve(d.name, table)
        if not r:
            skipped.append(d.name)
            continue
        nat, form = r
        dst = OUT / "emerald-expansion" / d.name
        tag = f" · {form.replace('_', ' ')}" if form else ""
        items: list[dict] = []
        for gba in ("", "_gba"):
            suf = " · estilo GBA" if gba else ""
            norm_pal = d / f"normal{gba}.pal"
            shiny_pal = d / f"shiny{gba}.pal"
            for stem, label, anim in (("anim_front", "Frente", True), ("back", "Espalda", False), ("icon", "Icono", False)):
                f = d / f"{stem}{gba}.png"
                if not f.exists():
                    continue
                img = Image.open(f)
                kind = "icon" if stem == "icon" else None
                if stem == "anim_front":
                    kind = None
                out_png = dst / f"{stem}{gba}.png"
                save_indexed(img, out_png, read_pal(norm_pal) if stem != "icon" and norm_pal.exists() else None)
                items.append(item(f"{label}{tag}{suf}", out_png, img, kind))
                if stem != "icon" and shiny_pal.exists():
                    sp = dst / f"{stem}{gba}_shiny.png"
                    save_indexed(img, sp, read_pal(shiny_pal))
                    items.append(item(f"{label} variocolor{tag}{suf}", sp, img))
        ow = d / "overworld.png"
        if ow.exists():
            img = Image.open(ow)
            save_indexed(img, dst / "overworld.png")
            it = item(f"Overworld (hoja){tag}", dst / "overworld.png", img)
            for k in ("n", "axis", "fw", "fh"):
                it.pop(k, None)
            items.append(it)
            sp = d / "overworld_shiny.pal"
            if sp.exists():
                save_indexed(img, dst / "overworld_shiny.png", read_pal(sp))
                items.append({"label": f"Overworld variocolor (hoja){tag}", "url": rel(dst / "overworld_shiny.png"), "w": img.width, "h": img.height})
        fp = d / "footprint.png"
        if fp.exists():
            img = Image.open(fp)
            save_indexed(img, dst / "footprint.png")
            items.append({"label": f"Huella{tag}", "url": rel(dst / "footprint.png"), "w": img.width, "h": img.height})
        if items:
            out.setdefault(nat, []).extend(items)
    if skipped:
        print(f"emerald-expansion: sin especie conocida ({len(skipped)}): {', '.join(skipped[:12])}…")
    return out


# ---------------------------------------------------------------- Platinum

def build_platinum(table: dict[str, int]) -> dict[int, list[dict]]:
    root = source_path("pokeplatinum") / "res/pokemon"
    fields = source_path("pokeplatinum") / "res/graphics/field_sprites/pokemon"
    out: dict[int, list[dict]] = {}
    skipped = []
    for d in sorted(p for p in root.iterdir() if p.is_dir() and not p.name.startswith(".")):
        r = resolve(d.name, table)
        if not r:
            skipped.append(d.name)
            continue
        nat, form = r
        dst = OUT / "platinum" / d.name
        tag = f" · {form.replace('_', ' ')}" if form else ""
        shiny_pal = d / "shiny.pal"
        items: list[dict] = []
        for stem, label in (("male_front", "Frente"), ("male_back", "Espalda"), ("female_front", "Frente hembra"), ("female_back", "Espalda hembra"), ("icon", "Icono")):
            f = d / f"{stem}.png"
            if not f.exists():
                continue
            if stem.startswith("female"):
                male = d / f.name.replace("female", "male")
                if male.exists() and male.read_bytes() == f.read_bytes():
                    continue
            img = Image.open(f)
            save_indexed(img, dst / f"{stem}.png")
            items.append(item(f"{label}{tag}", dst / f"{stem}.png", img, "icon" if stem == "icon" else None))
            if stem != "icon" and shiny_pal.exists():
                save_indexed(img, dst / f"{stem}_shiny.png", read_pal(shiny_pal))
                items.append(item(f"{label} variocolor{tag}", dst / f"{stem}_shiny.png", img))
        fp = d / "footprint.png"
        if fp.exists():
            img = Image.open(fp)
            save_indexed(img, dst / "footprint.png")
            items.append({"label": f"Huella{tag}", "url": rel(dst / "footprint.png"), "w": img.width, "h": img.height})
        fs = fields / f"{d.name}.png"
        if fs.exists():
            img = Image.open(fs)
            save_indexed(img, dst / "field.png")
            items.append({"label": f"Overworld (hoja){tag}", "url": rel(dst / "field.png"), "w": img.width, "h": img.height})
        if items:
            out.setdefault(nat, []).extend(items)
    if skipped:
        print(f"platinum: sin especie conocida ({len(skipped)}): {', '.join(skipped[:12])}…")
    return out


# ---------------------------------------------------------------- HeartGold

def build_heartgold() -> dict[int, list[dict]]:
    """pokegra.mk construye la paleta normal (-04.NCLR) desde male/front.png (o female si falta) y la variocolor
    (-05.NCLR) desde male/back.png: los índices de cada imagen se combinan con una u otra paleta."""
    base = source_path("pokeheartgold") / "files/poketool"
    out: dict[int, list[dict]] = {}

    def real(p: Path) -> bool:
        return p.exists() and p.stat().st_size > 0

    for d in sorted((base / "pokegra/pokegra").iterdir()):
        if not (d.is_dir() and d.name.isdigit()):
            continue
        nat = int(d.name)
        if nat == 0:
            continue
        dst = OUT / "heartgold" / d.name
        pal_src = {}
        for stem in ("front", "back"):
            for gender in ("male", "female"):
                f = d / gender / f"{stem}.png"
                if real(f):
                    pal_src[stem] = Image.open(f).getpalette()[:768]
                    break
        normal_pal = pal_src.get("front")
        shiny_pal = pal_src.get("back")
        items: list[dict] = []
        for gender, glabel in (("male", ""), ("female", " hembra")):
            for stem, label in (("front", "Frente"), ("back", "Espalda")):
                f = d / gender / f"{stem}.png"
                if not real(f):
                    continue
                if gender == "female" and real(d / "male" / f"{stem}.png") and (d / "male" / f"{stem}.png").read_bytes() == f.read_bytes():
                    continue
                img = Image.open(f)
                pad = lambda p: (p or []) + [0] * (768 - len(p or []))  # noqa: E731
                save_indexed(img, dst / f"{gender}_{stem}.png", pad(normal_pal))
                items.append(item(f"{label}{glabel}", dst / f"{gender}_{stem}.png", img))
                if shiny_pal:
                    save_indexed(img, dst / f"{gender}_{stem}_shiny.png", pad(shiny_pal))
                    items.append(item(f"{label} variocolor{glabel}", dst / f"{gender}_{stem}_shiny.png", img))
        # Los iconos van desplazados: poke_icon_00000007 es la especie 0 (huevo/forma), el 8 es Bulbasaur.
        ic = base / f"icongra/poke_icon/poke_icon_{nat + 7:08d}.png"
        if ic.exists():
            img = Image.open(ic)
            save_indexed(img, dst / "icon.png")
            items.append(item("Icono", dst / "icon.png", img, "icon"))
        if items:
            out.setdefault(nat, []).extend(items)
    return out


# ---------------------------------------------------------------- Crystal

def crystal_anim(path: Path) -> list[list[int]] | None:
    """anim.asm de Crystal -> secuencia lineal [[fotograma, ticks], ...] (macros de pic_anims.asm)."""
    cmds: list[tuple[str, list[int]]] = []
    for raw in path.read_text().splitlines():
        line = raw.split(";")[0].strip()
        if not line:
            continue
        m = re.match(r"(frame|setrepeat|dorepeat|endanim)\b\s*(.*)$", line)
        if not m:
            return None
        cmds.append((m.group(1), [int(v) for v in re.findall(r"\d+", m.group(2))]))
    seq: list[list[int]] = []
    pc, counter, steps = 0, 0, 0
    while pc < len(cmds) and steps < 2000:
        steps += 1
        op, a = cmds[pc]
        if op == "endanim":
            break
        if op == "frame":
            seq.append([a[0], a[1]])
        elif op == "setrepeat":
            counter = a[0]
        elif op == "dorepeat":
            counter -= 1
            if counter != 0:
                pc = a[0]
                continue
        pc += 1
    return seq


def build_crystal(table: dict[str, int]) -> dict[int, list[dict]]:
    root = source_path("pokecrystal") / "gfx/pokemon"
    out: dict[int, list[dict]] = {}
    skipped = []
    for d in sorted(p for p in root.iterdir() if p.is_dir()):
        r = resolve(d.name, table)
        if not r or not (d / "front.png").exists():
            skipped.append(d.name)
            continue
        nat, form = r
        dst = OUT / "crystal" / d.name
        tag = f" · {form.replace('_', ' ')}" if form else ""
        shiny_file = d / "shiny.pal"
        if not shiny_file.exists():  # unown_a... comparten la paleta de unown/
            shiny_file = root / d.name.split("_")[0] / "shiny.pal"
        shiny_rgb = [tuple(int(v) * 255 // 31 for v in re.findall(r"\d+", l)) for l in shiny_file.read_text().splitlines() if l.strip().startswith("RGB")] if shiny_file.exists() else []
        items: list[dict] = []
        for stem, label in (("front", "Frente"), ("back", "Espalda")):
            f = d / f"{stem}.png"
            if not f.exists():
                continue
            img = Image.open(f)
            w, h = img.size
            n = h // w if h % w == 0 else 1
            fh = h // n
            save_indexed(img, dst / f"{stem}.png")
            shiny = None
            if len(shiny_rgb) == 2:
                pal = (img.getpalette() or [])[:768]
                pal += [0] * (768 - len(pal))
                for i, rgb in enumerate(shiny_rgb):  # colores intermedios 1 y 2 (ver data/pokemon/palettes.asm)
                    pal[(i + 1) * 3 : (i + 1) * 3 + 3] = list(rgb)
                shiny = pal
                save_indexed(img, dst / f"{stem}_shiny.png", pal)
            first = {"label": f"{label}{tag}", "url": rel(dst / f"{stem}.png"), "w": w, "h": h, "n": n, "fw": w, "fh": fh}
            if n > 1:
                first["kind"] = "frames"
                anims = []
                for name, fn in (("Animación", "anim.asm"), ("Reposo", "anim_idle.asm")):
                    af = d / fn
                    if af.exists() and stem == "front":
                        seq = crystal_anim(af)
                        if seq:
                            anims.append({"name": name, "seq": seq})
                first["anims"] = anims
                if shiny:
                    first["shiny"] = rel(dst / f"{stem}_shiny.png")
            items.append(first)
            if shiny and n == 1:
                items.append({"label": f"{label} variocolor{tag}", "url": rel(dst / f"{stem}_shiny.png"), "w": w, "h": h})
        if items:
            out.setdefault(nat, []).extend(items)
    if skipped:
        print(f"crystal: sin especie o sin frente ({len(skipped)}): {', '.join(skipped[:12])}")
    return out


# ---------------------------------------------------------------- PMD Red

SHAPE_DIMS = {  # (forma, tamaño) -> (ancho, alto) en píxeles
    ("ST_OAM_SQUARE", 0): (8, 8), ("ST_OAM_SQUARE", 1): (16, 16), ("ST_OAM_SQUARE", 2): (32, 32), ("ST_OAM_SQUARE", 3): (64, 64),
    ("ST_OAM_H_RECTANGLE", 0): (16, 8), ("ST_OAM_H_RECTANGLE", 1): (32, 8), ("ST_OAM_H_RECTANGLE", 2): (32, 16), ("ST_OAM_H_RECTANGLE", 3): (64, 32),
    ("ST_OAM_V_RECTANGLE", 0): (8, 16), ("ST_OAM_V_RECTANGLE", 1): (8, 32), ("ST_OAM_V_RECTANGLE", 2): (16, 32), ("ST_OAM_V_RECTANGLE", 3): (32, 64),
}
POSE_RE = re.compile(
    r"AX_POSE(?:_FULL)?\(\s*(-?\d+)\s*,(?:\s*-?\d+\s*,\s*-?\d+\s*,)?\s*"
    r"OAM1\(\s*(\d+)\s*,\s*(ST_OAM_\w+)\s*,\s*\d+\s*\)\s*,\s*"
    r"OAM2\(\s*(\d+)\s*,\s*ST_OAM_SIZE_(\d)\s*,\s*FLIP\(\s*(\d)\s*,\s*(\d)\s*\)\s*,\s*\d+\s*,\s*\d+\s*\)\s*,\s*"
    r"OAM3\(\s*(\d+)\s*,\s*\d+\s*,\s*\d+\s*\)\s*\)"
)
ANIM_RE = re.compile(r"\.frames\s*=\s*(\d+),\s*\.unkFlags\s*=\s*(\d+),\s*\.poseId\s*=\s*(-?\d+),\s*\.offset\s*=\s*\{\s*(-?\d+),\s*(-?\d+)\s*\}")


def s8(v: int) -> int:
    return v - 256 if v >= 128 else v


def s9(v: int) -> int:
    """X de OAM2: las poses lo guardan en 8 bits con signo (244 -> -12, 11 -> +11)."""
    return s8(v & 0xFF)


def array_items(src: str, name: str) -> list[str]:
    m = re.search(rf"\b{re.escape(name)}\[\]\s*=\s*\{{(.*?)\n\}};", src, re.S)
    if not m:
        raise SystemExit(f"falta el arreglo {name}")
    return [t.strip() for t in re.split(r"[,\n]", m.group(1)) if t.strip() and not t.strip().startswith("//")]


def compose_pmd(name: str, header: Path, gfx_root: Path, dst: Path) -> dict:
    src = header.read_text()
    m = re.search(r"static const axmain sAxMain(\w+);", src)
    if not m:
        raise SystemExit(f"{header.name}: sin axmain")
    sym = m.group(1)

    # sprites: índice -> lista de piezas (PNG) en orden; el flujo de tiles es su concatenación.
    gfx_file = {g: p for g, p in re.findall(r"static const u8 (\w+)\[\] = INCBIN_U8\(\"graphics/ax/mon/[^/]+/([\w.]+)\.4bpp\"\);", src)}
    sprites_arr = array_items(src, f"sAxSprites{sym}")
    tile_streams: list[list[Image.Image]] = []
    palette: list[int] | None = None
    for sp in sprites_arr:
        body = re.search(rf"static const ax_sprite {re.escape(sp)}\[\] = \{{(.*?)\}};", src, re.S)
        if not body:
            raise SystemExit(f"{header.name}: falta {sp}")
        stream: list[Image.Image] = []
        for g, cnt in re.findall(r"\{\s*(\w+)\s*,\s*(ARRAY_COUNT\(\w+\)|\d+)\s*\}", body.group(1)):
            if g == "NULL":  # hueco: se borran cnt bytes de VRAM (32 bytes por tile de 4bpp)
                stream.extend(Image.new("P", (8, 8), 0) for _ in range(int(cnt) // 32))
                continue
            png = gfx_root / f"{gfx_file[g]}.png"
            im = Image.open(png)
            if im.mode != "P":
                raise SystemExit(f"{png}: no indexada")
            if palette is None:
                palette = (im.getpalette() or [])[:48]
                palette += [0] * (768 - len(palette))
            w, h = im.size
            for ty in range(h // 8):
                for tx in range(w // 8):
                    stream.append(im.crop((tx * 8, ty * 8, tx * 8 + 8, ty * 8 + 8)))
        tile_streams.append(stream)

    # poses
    pose_names = array_items(src, f"sAxPoses{sym}")
    poses: list[list[tuple]] = []
    for pn in pose_names:
        body = re.search(rf"static const ax_pose {re.escape(pn)}\[\] = \{{(.*?)\}};", src, re.S)
        if not body:
            raise SystemExit(f"{header.name}: falta {pn}")
        text = body.group(1)
        entries = POSE_RE.findall(text)
        if len(entries) != text.count("AX_POSE(") + text.count("AX_POSE_FULL("):
            raise SystemExit(f"{header.name}: {pn} tiene entradas AX_POSE que no se reconocen")
        poses.append([(int(a), s8(int(y)), shp, s9(int(x)), int(sz), int(hf), int(vf), int(t)) for a, y, shp, x, sz, hf, vf, t in entries])

    # render de cada pose en un lienzo con origen en (256, 128)
    OX, OY = 256, 128
    rendered: list[Image.Image] = []
    missing_tiles = 0
    for pose in poses:
        canvas = Image.new("P", (512, 256), 0)
        # El motor copia a VRAM los tiles de cada entrada de la pose en orden (RegisterSpriteParts); el tileNum
        # de cada OAM es relativo al inicio de ese flujo.
        stream: list[Image.Image] = []
        for e in pose:
            if e[0] > -1:
                stream.extend(tile_streams[e[0]])
        for sprite_i, y, shape, x, size, hf, vf, tile in reversed(pose):  # OAM de menor índice queda delante
            w, h = SHAPE_DIMS[(shape, size)]
            piece = Image.new("P", (w, h), 0)
            wt = w // 8
            for r in range(h // 8):
                for c in range(wt):
                    idx = tile + r * wt + c
                    if idx < len(stream):
                        piece.paste(stream[idx], (c * 8, r * 8))
                    else:
                        missing_tiles += 1
            if hf:
                piece = piece.transpose(Image.FLIP_LEFT_RIGHT)
            if vf:
                piece = piece.transpose(Image.FLIP_TOP_BOTTOM)
            mask = Image.frombytes("L", piece.size, bytes(255 if v else 0 for v in piece.tobytes()))
            canvas.paste(piece, (OX + x, OY + y), mask)
        rendered.append(canvas)
    if missing_tiles:
        print(f"  aviso {name}: {missing_tiles} tiles fuera del flujo")

    # animaciones
    anim_tables = array_items(src, f"sAxAnimations{sym}")
    anims: list[list[list[tuple]]] = []
    for tbl in anim_tables:
        dirs = array_items(src, tbl) if re.search(rf"\b{re.escape(tbl)}\[\]", src) else []
        seqs = []
        for dn in dirs:
            body = re.search(rf"static const ax_anim {re.escape(dn)}\[\] = \{{(.*?)\}};", src, re.S)
            if not body:
                raise SystemExit(f"{header.name}: falta {dn}")
            seqs.append([(int(f), int(p), int(dx), int(dy)) for f, _u, p, dx, dy in ANIM_RE.findall(body.group(1))])
        anims.append(seqs)

    used = sorted({p for a in anims for seq in a for _f, p, _dx, _dy in seq if 0 <= p < len(rendered)})
    boxes = {p: rendered[p].getbbox() for p in used}
    live = [b for b in boxes.values() if b]
    if not live:
        raise SystemExit(f"{header.name}: sin píxeles")
    x0 = min(b[0] for b in live)
    y0 = min(b[1] for b in live)
    x1 = max(b[2] for b in live)
    y1 = max(b[3] for b in live)
    cw, ch = x1 - x0, y1 - y0

    # atlas con poses únicas
    uniq: dict[bytes, int] = {}
    cells: list[Image.Image] = []
    pose_cell: dict[int, int] = {}
    for p in used:
        crop = rendered[p].crop((x0, y0, x1, y1))
        key = crop.tobytes()
        if key not in uniq:
            uniq[key] = len(cells)
            cells.append(crop)
        pose_cell[p] = uniq[key]
    cols = max(1, min(len(cells), 2048 // cw))
    rows = (len(cells) + cols - 1) // cols
    atlas = Image.new("P", (cols * cw, rows * ch), 0)
    for i, c in enumerate(cells):
        atlas.paste(c, ((i % cols) * cw, (i // cols) * ch))
    assert palette is not None
    save_indexed(atlas, dst.with_suffix(".png"), palette)

    # secuencias únicas por animación
    out_anims = []
    for ai, seqs in enumerate(anims):
        if not seqs or not any(seqs):
            continue
        table: list[list[list[int]]] = []
        dirs: list[int] = []
        for seq in seqs:
            enc = [[pose_cell[p], f, dx, dy] for f, p, dx, dy in seq if p in pose_cell]
            if enc not in table:
                table.append(enc)
            dirs.append(table.index(enc))
        out_anims.append({"id": ai, "seq": table, "dirs": dirs})
    pad = max([abs(v) for a in anims for seq in a for _f, _p, dx, dy in seq for v in (dx, dy)] or [0])
    doc = {"atlas": rel(dst.with_suffix(".png")), "cw": cw, "ch": ch, "cols": cols, "cells": len(cells), "pad": pad,
           "origin": [OX - x0, OY - y0], "anims": out_anims}
    dst.with_suffix(".json").write_text(json.dumps(doc, separators=(",", ":")) + "\n")
    return doc


def build_pmd(table: dict[str, int]) -> dict[int, list[dict]]:
    root = source_path("pmd-red")
    out: dict[int, list[dict]] = {}
    skipped = []
    for h in sorted((root / "src/data/ax").glob("*.h")):
        name = h.stem
        r = resolve(name, table)
        if not r:
            skipped.append(name)
            continue
        nat, form = r
        dst = OUT / "pmd-red" / name
        doc = compose_pmd(name, h, root / "graphics/ax/mon" / name, dst)
        tag = f" · {form.replace('_', ' ')}" if form else ""
        out.setdefault(nat, []).append({
            "label": f"Sprites de mazmorra{tag}", "kind": "pmd", "data": rel(dst.with_suffix(".json")),
            "atlas": doc["atlas"], "anims": len(doc["anims"]), "cell": [doc["cw"], doc["ch"]],
        })
    if skipped:
        print(f"pmd-red: sin especie conocida ({len(skipped)}): {', '.join(skipped[:12])}…")
    return out


# ---------------------------------------------------------------- PMD Sky: sprites WAN

def compose_sky_sprite(wan, dst: Path) -> dict | None:
    """Atlas + JSON de animaciones de un WAN de monstruo (mismo formato que los sprites de PMD Red)."""
    OX, OY = 256, 128
    anims = [(gi, seqs) for gi, seqs in enumerate(wan.anims) if seqs]
    used = sorted({fid for _gi, seqs in anims for seq in seqs for _d, fid, _x, _y in seq if 0 <= fid < len(wan.frames)})
    if not used:
        return None
    rendered: dict[int, Image.Image] = {}
    pal_used: set[int] = set()
    for fid in used:
        canvas = Image.new("P", (512, 256), 0)
        for piece in reversed(wan.frames[fid]):
            px = wan.render_piece(piece)
            if px is None:
                continue
            flat = bytes(v for row in px for v in row)
            im = Image.frombytes("P", (piece.w, piece.h), flat)
            mask = Image.frombytes("L", (piece.w, piece.h), bytes(255 if v else 0 for v in flat))
            canvas.paste(im, (OX + piece.x, OY + piece.y), mask)
            if piece.pal:
                pal_used.add(piece.pal)
        rendered[fid] = canvas
    boxes = [b for b in (rendered[f].getbbox() for f in used) if b]
    if not boxes:
        return None
    x0, y0 = min(b[0] for b in boxes), min(b[1] for b in boxes)
    x1, y1 = max(b[2] for b in boxes), max(b[3] for b in boxes)
    cw, ch = x1 - x0, y1 - y0
    cells: list[Image.Image] = []
    uniq: dict[bytes, int] = {}
    cell_of: dict[int, int] = {}
    for fid in used:
        crop = rendered[fid].crop((x0, y0, x1, y1))
        key = crop.tobytes()
        if key not in uniq:
            uniq[key] = len(cells)
            cells.append(crop)
        cell_of[fid] = uniq[key]
    cols = max(1, min(len(cells), 2048 // cw))
    atlas = Image.new("P", (cols * cw, ((len(cells) + cols - 1) // cols) * ch), 0)
    for i, c in enumerate(cells):
        atlas.paste(c, ((i % cols) * cw, (i // cols) * ch))
    pal = [c for rgb in wan.palettes[0] for c in rgb]
    save_indexed(atlas, dst.with_suffix(".png"), pal + [0] * (768 - len(pal)))
    out_anims = []
    for gi, seqs in anims:
        table: list = []
        dirs: list[int] = []
        for seq in seqs:
            enc = [[cell_of[fid], dur, dx, dy] for dur, fid, dx, dy in seq if fid in cell_of]
            if enc not in table:
                table.append(enc)
            dirs.append(table.index(enc))
        out_anims.append({"id": gi, "seq": table, "dirs": dirs})
    pad = max([abs(v) for _g, seqs in anims for seq in seqs for _d, _f, dx, dy in seq for v in (dx, dy)] or [0])
    doc = {"atlas": rel(dst.with_suffix(".png")), "cw": cw, "ch": ch, "cols": cols, "cells": len(cells), "pad": min(pad, 64),
           "origin": [OX - x0, OY - y0], "anims": out_anims, "extraPalettes": sorted(pal_used)}
    dst.with_suffix(".json").write_text(json.dumps(doc, separators=(",", ":")) + "\n")
    return doc


# ---------------------------------------------------------------- PMD Sky: retratos

def build_pmd_sky() -> dict[int, list[dict]]:
    """files/FONT/kaomado.kao + BALANCE/monster.md + MESSAGE/text_e.str -> atlas de retratos por fila de monstruo.

    monster.md: cabecera de 8 bytes (`MD\\0\\0` + nº de entradas) y entradas de 68 bytes; la palabra u16 0 es el
    número nacional. text_e.str: tabla de u32 con desplazamientos; el nombre de la fila r es la cadena 8734 + r.
    """
    import struct

    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import pmd_sky_kao as kao_mod

    root = source_path("pmd-sky")
    kao = kao_mod.Kao((root / "files/FONT/kaomado.kao").read_bytes())
    md = (root / "files/BALANCE/monster.md").read_bytes()
    if md[:4] != b"MD\0\0":
        raise SystemExit("monster.md: cabecera inesperada")
    count = struct.unpack_from("<I", md, 4)[0]
    text = (root / "files/language-specific/US/MESSAGE/text_e.str").read_bytes()
    n_str = struct.unpack_from("<I", text, 0)[0] // 4
    offs = struct.unpack_from(f"<{n_str}I", text, 0)

    def string(i: int) -> str:
        end = offs[i + 1] if i + 1 < n_str else len(text)
        return text[offs[i]:end].rstrip(b"\0").decode("latin-1")

    name_base = 8734
    out: dict[int, list[dict]] = {}
    first_row: dict[int, int] = {}
    excluded: list[int] = []
    dst = OUT / "pmd-sky"

    # Sprites de mazmorra: MONSTER/monster.bin (WAN); la palabra u16 8 de cada fila de monster.md es su índice.
    import pmd_sky_wan as wan_mod

    pack = wan_mod.read_pack((root / "files/MONSTER/monster.bin").read_bytes())
    sprite_docs: dict[int, dict | None] = {}

    def sprite_doc(idx: int) -> dict | None:
        if idx not in sprite_docs:
            sprite_docs[idx] = compose_sky_sprite(wan_mod.Wan(pack[idx]), dst / f"s{idx}") if idx < len(pack) and pack[idx] else None
        return sprite_docs[idx]

    sprite_items: dict[int, list[dict]] = {}
    seen_sprite: dict[int, set[int]] = {}
    for row in range(1, count):
        nat = struct.unpack_from("<H", md, 8 + row * 68)[0]
        idx = struct.unpack_from("<H", md, 8 + row * 68 + 16)[0]
        if not 0 < nat <= 493 or idx == 0xFFFF or idx >= len(pack) or idx in seen_sprite.setdefault(nat, set()):
            continue
        doc = sprite_doc(idx)
        if doc is None:
            continue
        seen_sprite[nat].add(idx)
        base = row - 600 if row >= 600 else row
        nm = string(name_base + base) if base < 600 else ""
        first = min(r for r in range(1, count) if struct.unpack_from("<H", md, 8 + r * 68)[0] == nat)
        label = "Sprites de mazmorra" if row == first else ("Sprites de mazmorra · hembra" if row >= 600 else f"Sprites de mazmorra · {nm or 'forma'} (fila {row})")
        sprite_items.setdefault(nat, []).append({
            "label": label, "kind": "pmd", "data": rel(dst / f"s{idx}.json"), "atlas": doc["atlas"],
            "anims": len(doc["anims"]), "cell": [doc["cw"], doc["ch"]], "row": row, "sprite": idx,
        })
    for row in range(1, count):
        emotions = kao.emotions(row)
        if not emotions:
            continue
        nat = struct.unpack_from("<H", md, 8 + row * 68)[0]
        if not 0 < nat <= 493:  # Sky acaba en el 493; hay filas con números falsos (Statue, Mama, Sentret, Bellossom)
            excluded.append(row)
            continue
        base_row = row - 600 if row >= 600 else row
        name = string(name_base + base_row) if base_row < 600 else ""
        # atlas: 5 columnas x filas, 40x40 por emoción, RGBA (cada retrato lleva su paleta)
        cols = 5
        rows_n = (len(emotions) + cols - 1) // cols
        atlas = Image.new("RGBA", (cols * 40, rows_n * 40), (0, 0, 0, 0))
        for i, e in enumerate(emotions):
            pal, pix = kao.portrait(row, e * 2)
            im = Image.new("P", (40, 40))
            im.putdata(kao_mod.tiles_to_indices(pix))
            im.putpalette([c for rgb in pal for c in rgb] + [0] * (768 - 48))
            atlas.paste(im.convert("RGBA"), ((i % cols) * 40, (i // cols) * 40))
        # Si caben en 256 colores, indexada (mucho más pequeña); si no, RGBA.
        png = dst / f"{row}.png"
        png.parent.mkdir(parents=True, exist_ok=True)
        colors = atlas.getcolors(maxcolors=256)
        if colors is not None:
            atlas.convert("RGB").quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(png, optimize=True)
        else:
            atlas.save(png, optimize=True)
        first = first_row.setdefault(nat, row)
        if row >= 600:
            label = "Retratos · hembra" if base_row == first or first_row.get(nat) == base_row else f"Retratos · {name} (hembra)"
        elif row == first:
            label = "Retratos"
        elif name and name != string(name_base + first):
            label = f"Retratos · {name} (fila {row})"
        else:
            label = f"Retratos · variante (fila {row})"
        out.setdefault(nat, []).append({
            "label": label, "kind": "portraits", "url": rel(png), "w": atlas.width, "h": atlas.height,
            "cols": cols, "cell": 40, "emotions": [kao_mod.EMOTIONS[e] for e in emotions], "row": row,
        })
    if excluded:
        print(f"pmd-sky: filas con retrato y número nacional fuera de 1-493, omitidas: {excluded}")
    for nat, items in sprite_items.items():
        out.setdefault(nat, [])[:0] = items  # sprites antes que retratos
    extra_pal = sum(1 for d in sprite_docs.values() if d and d["extraPalettes"])
    print(f"pmd-sky: {len(sprite_docs)} sprites WAN; {extra_pal} usan paletas extra (se pintan con la 0)")
    return out


# ---------------------------------------------------------------- índice

def main() -> None:
    wanted = sys.argv[1:] or list(SOURCE_INFO)
    for w in wanted:
        if w not in SOURCE_INFO:
            sys.exit(f"fuente desconocida {w!r}; opciones: {', '.join(SOURCE_INFO)}")
    table = species_table()
    index_path = OUT / "index.json"
    index = json.loads(index_path.read_text()) if index_path.exists() else {"sources": {}, "species": {}}
    builders = {
        "pmd-red": lambda: build_pmd(table),
        "emerald-expansion": lambda: build_expansion(table),
        "platinum": lambda: build_platinum(table),
        "heartgold": build_heartgold,
        "crystal": lambda: build_crystal(table),
        "pmd-sky": build_pmd_sky,
    }
    for w in wanted:
        res = builders[w]()
        index["sources"][w] = {"label": SOURCE_INFO[w]["label"], "repo": SOURCE_INFO[w]["repo"],
                               "commit": __import__("json").loads((ROOT / "tools/refs/sources.json").read_text())[SOURCE_INFO[w]["pin"]]["commit"],
                               "species": len(res)}
        for nat_s, per in list(index["species"].items()):
            per.pop(w, None)
        for nat, items in res.items():
            index["species"].setdefault(str(nat), {})[w] = items
        print(f"{w}: {len(res)} especies, {sum(len(v) for v in res.values())} elementos")
    index["species"] = {k: v for k, v in index["species"].items() if v}
    names = species_names()
    index["names"] = {k: names[int(k)] for k in index["species"] if int(k) in names}
    index["species"] = dict(sorted(index["species"].items(), key=lambda kv: int(kv[0])))
    OUT.mkdir(parents=True, exist_ok=True)
    index_path.write_text(json.dumps(index, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(f"índice: {len(index['species'])} especies nacionales")


if __name__ == "__main__":
    main()
