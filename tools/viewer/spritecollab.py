#!/usr/bin/env python3
"""Sprites y retratos de SpriteCollab (PMDCollab) para el dex del visor.

Lee el checkout fijado (npm run refs:fetch -- spritecollab), no copia imágenes: crea el enlace simbólico
public/sprites/sc -> ../../../refs-src/spritecollab (ignorado en git) y escribe un JSON por especie en
public/sprites/spritecollab-data/<dex>.json, además del elemento correspondiente en public/sprites/index.json.

Estructura del repositorio (verificada en sprite/0025 y portrait/0025):
  sprite/<dex>/            archivos de la forma base, sin variocolor, género por defecto
  sprite/<dex>/<forma>/    forma alternativa (nombre en tracker.json); <forma>/<0000|0001>/ = normal | variocolor;
                           dentro, <0001|0002>/ = macho | hembra
  <Acción>-Anim.png        hoja con columnas = fotogramas y filas = 8 direcciones (abajo, abajo-der., der., arriba-der.,
                           arriba, arriba-izq., izq., abajo-izq.); las acciones sin dirección tienen una sola fila
  AnimData.xml             nombre, índice, tamaño de fotograma, duraciones (1/60 s) y marcas de golpe por acción
  credits.txt              fecha, autor (id de Discord o CHUNSOFT), estado, etiqueta y acciones; nombres en credit_names.txt
Una acción que falta en una variante se hereda del nivel superior (misma condición de variocolor).
Licencia: CC BY-NC 4.0 con atribución a los autores (LICENSE.md del repositorio).
"""

from __future__ import annotations

import json
import os
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "refs"))
from common import ROOT, SOURCES, source_path  # noqa: E402

PUB = ROOT / "public" / "sprites"
DATA = PUB / "spritecollab-data"
LINK = PUB / "sc"
URL = "/sprites/sc"


def authors_of(path: Path, names: dict[str, dict]) -> list[dict]:
    out, seen = [], set()
    f = path / "credits.txt"
    if not f.exists():
        return out
    for line in f.read_text().splitlines():
        parts = line.split("\t")
        if len(parts) < 2:
            continue
        who = parts[1].strip()
        m = re.search(r"<@!?(\d+)>", who)
        key = m.group(1) if m else who
        if key in seen:
            continue
        seen.add(key)
        info = names.get(key) or names.get(who) or {}
        out.append({"name": info.get("name") or (who if not m else f"Discord {key}"), "contact": info.get("contact", "")})
    return out


def load_names(src: Path) -> dict[str, dict]:
    names: dict[str, dict] = {}
    for i, line in enumerate((src / "credit_names.txt").read_text().splitlines()):
        if i == 0 or not line.strip():
            continue
        c = line.split("\t")
        name, disc = c[0], c[1] if len(c) > 1 else ""
        contact = c[2] if len(c) > 2 else ""
        m = re.search(r"<@!?(\d+)>", disc)
        entry = {"name": name, "contact": contact if contact.startswith("http") else ""}
        names[m.group(1) if m else disc or name] = entry
        names.setdefault(name, entry)
    return names


def parse_anims(d: Path) -> dict[str, dict]:
    """AnimData.xml -> {nombre: {index, fw, fh, durations, rush, hit, ret, copyOf, sheet}}."""
    f = d / "AnimData.xml"
    if not f.exists():
        return {}
    root = ET.parse(f).getroot()
    out: dict[str, dict] = {}
    for a in root.iter("Anim"):
        name = (a.findtext("Name") or "").strip()
        if not name:
            continue
        copy = (a.findtext("CopyOf") or "").strip()
        fw, fh = a.findtext("FrameWidth"), a.findtext("FrameHeight")
        out[name] = {
            "index": int(a.findtext("Index") or -1),
            "fw": int(fw) if fw else 0, "fh": int(fh) if fh else 0,
            "durations": [int(x.text or 0) for x in a.iter("Duration")],
            "rush": a.findtext("RushFrame"), "hit": a.findtext("HitFrame"), "ret": a.findtext("ReturnFrame"),
            "copyOf": copy or None,
        }
    return out


def dir_nodes(base: Path) -> list[tuple[Path, str, bool, int]]:
    """(directorio, forma, variocolor, género) de cada nodo con contenido, de la raíz de la especie hacia abajo."""
    nodes = [(base, "0000", False, 1)]
    for form in sorted(p for p in base.iterdir() if p.is_dir() and p.name.isdigit()):
        nodes.append((form, form.name, False, 1))
        for sh in sorted(p for p in form.iterdir() if p.is_dir() and p.name.isdigit()):
            shiny = sh.name == "0001"
            nodes.append((sh, form.name, shiny, 1))
            for g in sorted(p for p in sh.iterdir() if p.is_dir() and p.name.isdigit()):
                nodes.append((g, form.name, shiny, int(g.name)))
    return nodes


def name_pmd_animations(src: Path, index: dict) -> tuple[int, int]:
    """Pone `name` en las animaciones de los JSON de PMD Red/Sky cuyo índice y lista de duraciones coinciden con la
    acción del mismo índice en el AnimData.xml base de la especie en SpriteCollab (coincidencia exacta, si no se deja sin nombre)."""
    named = checked = 0
    cache: dict[str, dict] = {}
    for nat, per in index["species"].items():
        base = src / "sprite" / f"{int(nat):04d}"
        for source in ("pmd-red", "pmd-sky"):
            for it in per.get(source, []):
                if it.get("kind") != "pmd":
                    continue
                f = PUB.parent / it["data"].lstrip("/")
                if not f.exists():
                    continue
                key = str(base)
                if key not in cache:
                    cache[key] = parse_anims(base)
                by_index = {a["index"]: (n, a) for n, a in cache[key].items()}
                doc = json.loads(f.read_text())
                changed = False
                for an in doc["anims"]:
                    checked += 1
                    first = an["seq"][an["dirs"][0]] if an["seq"] else []
                    durs = [fr[1] for fr in first]
                    hit = by_index.get(an["id"])
                    if hit and hit[1]["durations"] == durs and durs:
                        if an.get("name") != hit[0]:
                            an["name"] = hit[0]
                            changed = True
                        named += 1
                    elif "name" in an:
                        del an["name"]
                        changed = True
                if changed:
                    f.write_text(json.dumps(doc, separators=(",", ":")) + "\n")
    return named, checked


def main() -> None:
    src = source_path("spritecollab")
    names = load_names(src)
    tracker = json.loads((src / "tracker.json").read_text())

    if LINK.is_symlink() or LINK.exists():
        if LINK.is_symlink() and os.path.realpath(LINK) == str(src.resolve()):
            pass
        elif LINK.is_symlink():
            LINK.unlink()
            LINK.symlink_to(os.path.relpath(src, PUB))
        else:
            raise SystemExit(f"{LINK} existe y no es un enlace simbólico")
    else:
        PUB.mkdir(parents=True, exist_ok=True)
        LINK.symlink_to(os.path.relpath(src, PUB))
    DATA.mkdir(parents=True, exist_ok=True)
    for old in DATA.glob("*.json"):
        old.unlink()

    def form_name(dex: str, form: str) -> str:
        t = tracker.get(dex, {})
        return (t.get("subgroups", {}).get(form, {}).get("name") or "").replace("_", " ")

    per_species: dict[int, dict] = {}
    n_sprites = n_portraits = 0
    for dex in sorted(os.listdir(src / "sprite")):
        if not dex.isdigit():
            continue
        entry: dict = {"dex": int(dex), "name": tracker.get(dex, {}).get("name", ""), "sprites": [], "portraits": []}
        sbase = src / "sprite" / dex
        # --- sprites
        by_key: dict[tuple, dict] = {}
        for path, form, shiny, gender in dir_nodes(sbase):
            anims = parse_anims(path)
            if not anims and not list(path.glob("*-Anim.png")):
                continue
            by_key[(form, shiny, gender)] = {"path": path, "anims": anims}
        for (form, shiny, gender), node in sorted(by_key.items()):
            # herencia: género -> mismo color de la forma -> forma base (mismo color)
            chain = [(form, shiny, gender)]
            if gender != 1:
                chain.append((form, shiny, 1))
            if form != "0000":
                chain.append(("0000", shiny, gender if gender != 1 else 1))
                chain.append(("0000", shiny, 1))
            merged: dict[str, dict] = {}
            for k in reversed(chain):
                n = by_key.get(k)
                if not n:
                    continue
                for name, a in n["anims"].items():
                    merged[name] = {**a, "dir": n["path"], "inherited": k != (form, shiny, gender)}
            if not merged:
                continue
            anims_out = []
            for name, a in sorted(merged.items(), key=lambda kv: kv[1]["index"]):
                target = a["copyOf"] or name
                png = Path(a["dir"]) / f"{target}-Anim.png"
                if not png.exists():  # la acción hereda la hoja del nivel superior
                    for k in chain:
                        cand = by_key.get(k)
                        if cand and (Path(cand["path"]) / f"{target}-Anim.png").exists():
                            png = Path(cand["path"]) / f"{target}-Anim.png"
                            break
                    else:
                        continue
                anims_out.append({
                    "name": name, "index": a["index"], "fw": a["fw"], "fh": a["fh"], "durations": a["durations"],
                    "rush": a["rush"], "hit": a["hit"], "ret": a["ret"], "inherited": a["inherited"],
                    "url": f"{URL}/{png.relative_to(src).as_posix()}",
                })
            if not anims_out:
                continue
            entry["sprites"].append({
                "form": form, "formName": form_name(dex, form), "shiny": shiny, "gender": "female" if gender == 2 else "male",
                "authors": authors_of(node["path"], names), "anims": anims_out,
            })
            n_sprites += 1
        # --- retratos
        pbase = src / "portrait" / dex
        if pbase.exists():
            for path, form, shiny, gender in dir_nodes(pbase):
                files = sorted(p for p in path.glob("*.png") if "^" not in p.name)
                if not files:
                    continue
                entry["portraits"].append({
                    "form": form, "formName": form_name(dex, form), "shiny": shiny, "gender": "female" if gender == 2 else "male",
                    "authors": authors_of(path, names),
                    "emotions": [{"name": p.stem, "url": f"{URL}/{p.relative_to(src).as_posix()}"} for p in files],
                })
                n_portraits += 1
        if entry["sprites"] or entry["portraits"]:
            (DATA / f"{dex}.json").write_text(json.dumps(entry, ensure_ascii=False, separators=(",", ":")) + "\n")
            per_species[int(dex)] = {"sprites": len(entry["sprites"]), "portraits": len(entry["portraits"])}

    # índice de sprites (se mezcla con el de las demás fuentes)
    index_path = PUB / "index.json"
    index = json.loads(index_path.read_text()) if index_path.exists() else {"sources": {}, "species": {}}
    for per in index["species"].values():
        per.pop("spritecollab", None)
    for dex, c in per_species.items():
        index["species"].setdefault(str(dex), {})["spritecollab"] = [{
            "label": f"Arte de la comunidad · {c['sprites']} sprites, {c['portraits']} retratos", "kind": "spritecollab",
            "data": f"/sprites/spritecollab-data/{dex:04d}.json", "sprites": c["sprites"], "portraits": c["portraits"],
        }]
    index["sources"]["spritecollab"] = {
        "label": "SpriteCollab (PMDCollab)", "repo": "PMDCollab/SpriteCollab", "commit": SOURCES["spritecollab"]["commit"],
        "species": len(per_species), "origin": "community", "license": "CC BY-NC 4.0",
        "credit": "Cada variante lista a sus autores (credits.txt); créditos completos en credit_names.txt del repositorio.",
    }
    index["species"] = dict(sorted(((k, v) for k, v in index["species"].items() if v), key=lambda kv: int(kv[0])))
    index_path.write_text(json.dumps(index, ensure_ascii=False, separators=(",", ":")) + "\n")
    named, checked = name_pmd_animations(src, index)
    print(f"nombres de acción en PMD Red/Sky: {named} de {checked} animaciones (coincidencia exacta de duraciones con AnimData.xml)")
    print(f"spritecollab: {len(per_species)} especies, {n_sprites} conjuntos de sprites, {n_portraits} conjuntos de retratos")


if __name__ == "__main__":
    main()
