#!/usr/bin/env python3
"""Mapa del mundo de Crystal (Johto + Kanto) a partir de las conexiones de public/crystal/maps.json.

Escribe en public/crystal/world/: world.json, overview.png (16 px por bloque) y teselas de 1024 px
a 32 px por bloque (t_<cx>_<cy>.png). Requiere `npm run crystal:maps`.

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
    half = full.resize((full.width // 2, full.height // 2), Image.BOX).quantize(colors=256, dither=Image.Dither.NONE)
    half.save(OUT / "overview.png", optimize=True)
    (OUT / "world.json").write_text(json.dumps({
        "w": W, "h": H, "blockPx": 32, "tile": TILE, "tiles": tiles, "maps": entries,
        "sections": [{"name": n, "conflicts": c} for n, _comp, c in sections],
        "overlaps": overlaps, "unplaced": sorted(k for k in by if k not in all_pos),
        "note": "Johto y Kanto se unen con warps en el juego; la colocación entre secciones es editorial.",
    }, separators=(",", ":")) + "\n")
    print(f"{W}x{H} bloques, {len(entries)} mapas, {len(tiles)} teselas; conflictos: {len(c1)}/{len(c2)}/{len(c3)}, solapes: {len(overlaps)}, sin colocar: {len(by) - len(entries)}")


if __name__ == "__main__":
    main()
