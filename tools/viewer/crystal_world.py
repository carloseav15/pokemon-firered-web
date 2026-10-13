#!/usr/bin/env python3
"""Mapa del mundo de Crystal (Johto + Kanto) a partir de las conexiones de public/crystal/maps.json.

Escribe en public/crystal/world/: world.json, overview.png (16 px por bloque), teselas de 1024 px
a 32 px por bloque (t_<cx>_<cy>.png) y la capa de sprites de objetos aparte (o_<cx>_<cy>.png, overview_obj.png). Requiere `npm run crystal:maps`.

Las conexiones del decomp (`connection <dir>, <mapa>, <id>, <offset>`) colocan cada mapa respecto a su vecino:
norte/sur desplazan en X por `offset`, este/oeste en Y. El grafo de conexiones tiene tres componentes:
Johto (AzaleaTown...), Kanto (CeladonCity...) y Route 28 + Silver Cave. El juego los une con warps
(Route 26 -> Victory Road Gate -> Route 22), no con conexiones, así que la colocación relativa entre
componentes es editorial: Kanto a la derecha de Johto con Route 22 alineada a Route 26, y Route 28 encima.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "refs"))
from common import ROOT  # noqa: E402

CRYSTAL = ROOT / "public" / "crystal"
OUT = CRYSTAL / "world"
GAP = 10  # bloques entre componentes
TILE = 1024


def place(by: dict, start: str) -> tuple[dict[str, tuple[int, int]], list[dict]]:
    comp = {start: (0, 0)}
    queue = [start]
    conflicts = []
    while queue:
        n = queue.pop(0)
        m = by[n]
        x, y = comp[n]
        for c in m["connections"]:
            t = by[c["map"]]
            o = c["offset"]
            d = c["direction"]
            if d == "north":
                p = (x + o, y - t["h"])
            elif d == "south":
                p = (x + o, y + m["h"])
            elif d == "west":
                p = (x - t["w"], y + o)
            else:
                p = (x + m["w"], y + o)
            if t["name"] in comp:
                if comp[t["name"]] != p:
                    conflicts.append({"from": n, "to": t["name"], "placed": list(comp[t["name"]]), "wanted": list(p), "direction": d})
            else:
                comp[t["name"]] = p
                queue.append(t["name"])
    return comp, conflicts


def bounds(comp: dict, by: dict) -> tuple[int, int, int, int]:
    return (
        min(p[0] for p in comp.values()),
        min(p[1] for p in comp.values()),
        max(p[0] + by[k]["w"] for k, p in comp.items()),
        max(p[1] + by[k]["h"] for k, p in comp.items()),
    )


def warp_links(by: dict, placed: dict) -> list[dict]:
    """Pares de mapas exteriores unidos a través de interiores (puertas, cuevas, túneles).

    Las salas sin conexión de mapa forman componentes unidos por warps; cada puerta de un mapa colocado que
    entra en una componente es una salida. Dos salidas de mapas distintos de la misma componente son un enlace.
    `via` es el camino más corto entre ambos por las salas interiores.
    """
    # Salas con un warp de destino -1 (Pokécenter 2F, centros de intercambio...) vuelven a la última puerta
    # usada: unirían todos los centros entre sí, así que no se atraviesan.
    # FastShip1F es el trayecto Olivine <-> Vermilion: se atraviesa aunque su salida sea dinámica.
    hubs = {n for n in by if any(w["warp"] == -1 for w in by[n]["warps"]) and n != "FastShip1F"}
    inner = [n for n in by if n not in placed and n not in hubs]
    adj: dict[str, set[str]] = {n: set() for n in inner}
    for n in inner:
        for w in by[n]["warps"]:
            d = w["dest"]
            if d in adj and d != n:
                adj[n].add(d)
                adj[d].add(n)
    comp_of: dict[str, int] = {}
    for n in inner:
        if n in comp_of:
            continue
        stack = [n]
        comp_of[n] = n_id = len(set(comp_of.values()))
        while stack:
            cur = stack.pop()
            for nb in adj[cur]:
                if nb not in comp_of:
                    comp_of[nb] = n_id
                    stack.append(nb)

    def path(src: str, dst: str) -> list[str]:
        prev = {src: None}
        queue = [src]
        while queue:
            cur = queue.pop(0)
            if cur == dst:
                break
            for nb in sorted(adj[cur]):
                if nb not in prev:
                    prev[nb] = cur
                    queue.append(nb)
        out, cur = [], dst
        while cur is not None:
            out.append(cur)
            cur = prev.get(cur)
        return out[::-1]

    exits: dict[int, list[tuple[str, int, str]]] = {}
    for name, e in placed.items():
        for k, w in enumerate(by[name]["warps"]):
            if w["dest"] in comp_of:
                exits.setdefault(comp_of[w["dest"]], []).append((name, k, w["dest"]))
    links = []
    for ex in exits.values():
        for i, (a, ka, ia) in enumerate(ex):
            for b, kb, ib in ex[i + 1 :]:
                if a == b:
                    continue
                wa, wb = by[a]["warps"][ka], by[b]["warps"][kb]
                links.append({"a": {"map": a, "x": wa["x"], "y": wa["y"]}, "b": {"map": b, "x": wb["x"], "y": wb["y"]},
                              "via": path(ia, ib), "cross": placed[a]["section"] != placed[b]["section"]})
    # Una entrada por par de mapas y camino (varias puertas de un mismo edificio dan el mismo enlace).
    seen, out = set(), []
    for l in links:
        key = (tuple(sorted((l["a"]["map"], l["b"]["map"]))), tuple(l["via"]))
        if key not in seen:
            seen.add(key)
            out.append(l)
    return out


def main() -> None:
    doc = json.loads((CRYSTAL / "maps.json").read_text())
    by = {m["name"]: m for m in doc["maps"]}
    johto, c1 = place(by, "AzaleaTown")
    kanto, c2 = place(by, "CeladonCity")
    extra, c3 = place(by, "Route28")

    # Johto en el origen; Kanto a la derecha con Route 22 a la altura de Route 26; Route 28 sobre Kanto.
    jx0, jy0, jx1, jy1 = bounds(johto, by)
    kx0, ky0, kx1, ky1 = bounds(kanto, by)
    dy = johto["Route26"][1] - kanto["Route22"][1]
    dx = jx1 + GAP - kx0
    kanto = {k: (x + dx, y + dy) for k, (x, y) in kanto.items()}
    kx0, ky0, kx1, ky1 = bounds(kanto, by)
    ex0, ey0, ex1, ey1 = bounds(extra, by)
    extra = {k: (x + kx0 - ex0, y + ky0 - GAP - ey1) for k, (x, y) in extra.items()}

    sections = [("Johto", johto, c1), ("Kanto", kanto, c2), ("Route 28 y Silver Cave", extra, c3)]
    all_pos = {k: p for _n, comp, _c in sections for k, p in comp.items()}
    x0, y0, x1, y1 = bounds(all_pos, by)
    entries = []
    for name, comp, conflicts in sections:
        for k, (x, y) in comp.items():
            entries.append({"name": k, "x": x - x0, "y": y - y0, "w": by[k]["w"], "h": by[k]["h"], "section": name,
                            "landmark": by[k]["landmark"], "environment": by[k]["environment"]})
    W, H = x1 - x0, y1 - y0

    # solapes entre mapas (por conflictos de conexiones del propio decomp)
    overlaps = []
    for i, a in enumerate(entries):
        for b in entries[i + 1 :]:
            if a["x"] < b["x"] + b["w"] and b["x"] < a["x"] + a["w"] and a["y"] < b["y"] + b["h"] and b["y"] < a["y"] + a["h"]:
                overlaps.append([a["name"], b["name"]])

    links = warp_links(by, {e["name"]: e for e in entries})

    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.png"):
        old.unlink()
    full = Image.new("RGB", (W * 32, H * 32), (11, 15, 20))
    # Los mapas se pegan en orden; en un solape gana el último (queda listado en world.json).
    for e in entries:
        full.paste(Image.open(CRYSTAL / "maps" / f"{e['name']}.png"), (e["x"] * 32, e["y"] * 32))
    tiles = []
    for cy in range(0, full.height, TILE):
        for cx in range(0, full.width, TILE):
            t = full.crop((cx, cy, min(cx + TILE, full.width), min(cy + TILE, full.height)))
            if t.getbbox() is None or all(c == (11, 15, 20) for _n, c in (t.getcolors(1) or [(0, (0, 0, 0))])):
                continue
            q = t.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
            name = f"t_{cx // TILE}_{cy // TILE}.png"
            q.save(OUT / name, optimize=True)
            tiles.append({"file": name, "x": cx, "y": cy, "w": t.width, "h": t.height})
    # Capa de sprites de objetos (<Mapa>_obj.png de crystal_maps.py), aparte para poder ocultarla.
    spr = Image.new("RGBA", full.size, (0, 0, 0, 0))
    for e in entries:
        obj = CRYSTAL / "maps" / f"{e['name']}_obj.png"
        if obj.exists():
            spr.alpha_composite(Image.open(obj), (e["x"] * 32, e["y"] * 32))
    sprite_tiles = []
    for cy in range(0, spr.height, TILE):
        for cx in range(0, spr.width, TILE):
            t = spr.crop((cx, cy, min(cx + TILE, spr.width), min(cy + TILE, spr.height)))
            if t.getbbox() is None:
                continue
            name = f"o_{cx // TILE}_{cy // TILE}.png"
            t.save(OUT / name, optimize=True)
            sprite_tiles.append({"file": name, "x": cx, "y": cy, "w": t.width, "h": t.height})
    spr.resize((spr.width // 2, spr.height // 2), Image.BOX).save(OUT / "overview_obj.png", optimize=True)
    half = full.resize((full.width // 2, full.height // 2), Image.BOX).quantize(colors=256, dither=Image.Dither.NONE)
    half.save(OUT / "overview.png", optimize=True)
    (OUT / "world.json").write_text(json.dumps({
        "w": W, "h": H, "blockPx": 32, "tile": TILE, "tiles": tiles, "spriteTiles": sprite_tiles, "maps": entries,
        "sections": [{"name": n, "conflicts": c} for n, _comp, c in sections],
        "links": links, "overlaps": overlaps, "unplaced": sorted(k for k in by if k not in all_pos),
        "note": "Johto y Kanto se unen con warps en el juego; la colocación entre secciones es editorial.",
    }, separators=(",", ":")) + "\n")
    print(f"enlaces por warps: {len(links)} ({sum(1 for l in links if l['cross'])} entre secciones)")
    print(f"{W}x{H} bloques, {len(entries)} mapas, {len(tiles)} teselas; conflictos: {len(c1)}/{len(c2)}/{len(c3)}, solapes: {len(overlaps)}, sin colocar: {len(by) - len(entries)}")


if __name__ == "__main__":
    main()
