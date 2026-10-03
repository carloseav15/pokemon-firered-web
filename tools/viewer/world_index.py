"""Indice del visor del mundo v1 (Kanto exterior).

Lee public/fr/maps + layouts para unir los 37 mapas exteriores por sus
conexiones (BFS en cola FIFO desde MAP_PALLET_TOWN) y el decomp para los
nombres simbolicos (map.json: graphics/flags/vars) y los writers
(setvar/setflag/clearflag en scripts.inc).

Salida determinista: public/viewer/kanto.json (listas ordenadas).
Plan: docs/VISOR-MUNDO.md par. 4.
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from collections import deque
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "decomp"))
from common import DECOMP, ROOT  # noqa: E402

PUBLIC_MAPS = ROOT / "public" / "fr" / "maps"
PUBLIC_LAYOUTS = ROOT / "public" / "fr" / "layouts"
OUT = ROOT / "public" / "viewer" / "kanto.json"

ORIGIN = "MAP_PALLET_TOWN"
DIRS = ("up", "down", "left", "right")

SETVAR_RE = re.compile(r"^\s*setvar\s+(\w+)\s*,\s*(\w+)")
ADDVAR_RE = re.compile(r"^\s*addvar\s+(\w+)\s*,\s*(\w+)")
COPYVAR_RE = re.compile(r"^\s*copyvar\s+(\w+)\s*,\s*(\w+)")
SETFLAG_RE = re.compile(r"^\s*setflag\s+(\w+)")
CLEARFLAG_RE = re.compile(r"^\s*clearflag\s+(\w+)")
SETOBJECTXY_RE = re.compile(r"^\s*setobjectxyperm\s+(\w+)\s*,")
TRAINERBATTLE_RE = re.compile(r"^\s*trainerbattle\w*\s+([\w, ]+)")
TRAINER_CONST_RE = re.compile(r"\b(TRAINER_[A-Z0-9_]+)\b")
LABEL_RE = re.compile(r"^(\S.*?)(::|:)\s*$")

# movementType numerico del exportado -> direccion de mirada (FACE_* del C).
FACING_BY_MOVEMENT = {7: "up", 8: "down", 9: "left", 10: "right"}


def load_public():
    maps = {}
    for p in sorted(PUBLIC_MAPS.glob("MAP_*.json")):
        d = json.loads(p.read_text())
        maps[d["id"]] = d
    layouts = {}
    for p in sorted(PUBLIC_LAYOUTS.glob("LAYOUT_*.json")):
        d = json.loads(p.read_text())
        layouts[d["id"]] = d
    return maps, layouts


def decomp_commit() -> str:
    out = subprocess.run(
        ["git", "rev-parse", "HEAD"], cwd=DECOMP, capture_output=True, text=True
    )
    return out.stdout.strip() if out.returncode == 0 else "unknown"


def bfs(maps, layouts):
    def size(mid):
        lay = layouts[maps[mid]["layout"]]
        return lay["width"], lay["height"]

    pos = {ORIGIN: (0, 0)}
    queue = deque([ORIGIN])
    conflicts = []
    while queue:
        a = queue.popleft()
        ax, ay = pos[a]
        aw, ah = size(a)
        for conn in maps[a].get("connections", []):
            d = conn["direction"]
            if d not in DIRS:
                continue
            b = conn["map"]
            if b not in maps:
                continue
            o = conn["offset"]
            bw, bh = size(b)
            if d == "up":
                prop = (ax + o, ay - bh)
            elif d == "down":
                prop = (ax + o, ay + ah)
            elif d == "left":
                prop = (ax - bw, ay + o)
            else:
                prop = (ax + aw, ay + o)
            if b not in pos:
                pos[b] = prop
                queue.append(b)
            elif pos[b] != prop:
                conflicts.append(
                    {
                        "from": a,
                        "to": b,
                        "placed": list(pos[b]),
                        "proposed": list(prop),
                    }
                )
    conflicts.sort(key=lambda c: (c["from"], c["to"]))
    return pos, conflicts


def decomp_map_json(folder: str):
    p = DECOMP / "data" / "maps" / folder / "map.json"
    if not p.exists():
        return None
    return json.loads(p.read_text())


def moved_localids(folder: str) -> set[str]:
    p = DECOMP / "data" / "maps" / folder / "scripts.inc"
    found: set[str] = set()
    if not p.exists():
        return found
    for line in p.read_text(encoding="utf-8", errors="replace").splitlines():
        m = SETOBJECTXY_RE.match(line)
        if m:
            found.add(m.group(1))
    return found


def parse_scripts():
    """Writers (setvar/addvar/copyvar/setflag/clearflag) y etiqueta -> TRAINER_.

    El TRAINER_ sale de la primera constante TRAINER_* (que no sea
    TRAINER_BATTLE_*) en una linea trainerbattle* del cuerpo de la etiqueta.
    """
    writers: dict[str, list[dict]] = {}
    trainer_of: dict[str, str] = {}

    def add_var(var, value, area, label, line):
        try:
            v = int(value, 0)
        except ValueError:
            v = value
        writers.setdefault(var, []).append(
            {"value": v, "map": area, "label": label, "line": line}
        )

    def add_addvar(var, value, area, label, line):
        try:
            v = int(value, 0)
        except ValueError:
            v = value
        writers.setdefault(var, []).append(
            {"action": "add", "value": v, "map": area, "label": label, "line": line}
        )

    def add_copyvar(dest, src, area, label, line):
        writers.setdefault(dest, []).append(
            {"action": "copy", "from": src, "map": area, "label": label, "line": line}
        )

    def add_flag(flag, action, area, label, line):
        writers.setdefault(flag, []).append(
            {"action": action, "map": area, "label": label, "line": line}
        )

    files: list[tuple[str, Path]] = []
    for d in sorted((DECOMP / "data" / "maps").iterdir()):
        if not d.is_dir():
            continue
        p = d / "scripts.inc"
        if p.exists():
            files.append((d.name, p))
    scripts_dir = DECOMP / "data" / "scripts"
    if scripts_dir.exists():
        for p in sorted(scripts_dir.glob("*.inc")):
            files.append((p.stem, p))

    for area, path in files:
        label = ""
        try:
            text = path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        for i, line in enumerate(text.splitlines(), start=1):
            s = line.strip()
            lm = LABEL_RE.match(s)
            if lm:
                label = lm.group(1)
                continue
            if not label:
                continue
            m = SETVAR_RE.match(line)
            if m:
                add_var(m.group(1), m.group(2), area, label, i)
                continue
            m = ADDVAR_RE.match(line)
            if m:
                add_addvar(m.group(1), m.group(2), area, label, i)
                continue
            m = COPYVAR_RE.match(line)
            if m:
                add_copyvar(m.group(1), m.group(2), area, label, i)
                continue
            m = SETFLAG_RE.match(line)
            if m:
                add_flag(m.group(1), "set", area, label, i)
                continue
            m = CLEARFLAG_RE.match(line)
            if m:
                add_flag(m.group(1), "clear", area, label, i)
                continue
            m = TRAINERBATTLE_RE.match(line)
            if m and label not in trainer_of:
                consts = [c for c in TRAINER_CONST_RE.findall(m.group(1)) if not c.startswith("TRAINER_BATTLE_")]
                if consts:
                    trainer_of[label] = consts[0]
                continue
    for k in writers:
        writers[k].sort(key=lambda e: (e["map"], e["label"], e["line"]))
    return dict(sorted(writers.items())), trainer_of


def initial_flags() -> dict[str, int]:
    """Flags activos al iniciar partida (7.4): los setflag de
    EventScript_ResetAllMapFlags (data/event_scripts.s), que new_game.c:149
    ejecuta con RunScriptImmediately al crear la partida. Un objeto con uno
    de estos flags empieza oculto. Devuelve flag -> linea en event_scripts.s.
    """
    path = DECOMP / "data" / "event_scripts.s"
    found: dict[str, int] = {}
    try:
        lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    except OSError:
        return found
    inside = False
    for i, line in enumerate(lines, start=1):
        s = line.strip()
        if s == "EventScript_ResetAllMapFlags::":
            inside = True
            continue
        if inside:
            if s == "end":
                break
            m = SETFLAG_RE.match(line)
            if m and m.group(1) not in found:
                found[m.group(1)] = i
    return dict(sorted(found.items()))


def to_int(v, default=0):
    try:
        return int(v)
    except (TypeError, ValueError):
        return default


def main() -> int:
    maps, layouts = load_public()
    pos, conflicts = bfs(maps, layouts)

    xs = [x for x, _ in pos.values()]
    ys = [y for _, y in pos.values()]
    minx, miny = min(xs), min(ys)
    maxx = max(x + layouts[maps[m]["layout"]]["width"] for m, (x, y) in pos.items())
    maxy = max(y + layouts[maps[m]["layout"]]["height"] for m, (x, y) in pos.items())

    maps_out = {}
    for mid in sorted(pos):
        x, y = pos[mid]
        lay = layouts[maps[mid]["layout"]]
        maps_out[mid] = {
            "x": x,
            "y": y,
            "width": lay["width"],
            "height": lay["height"],
            "layout": maps[mid]["layout"],
            "title": maps[mid]["name"],
            "section": maps[mid].get("regionMapSectionName", ""),
        }

    elements: list[dict] = []
    triggers: list[dict] = []
    writers, trainer_of = parse_scripts()
    hidden_at_start = initial_flags()
    for mid in sorted(pos):
        pub = maps[mid]
        folder = pub["name"]
        dm = decomp_map_json(folder)
        decomp_objs = dm["object_events"] if dm else []
        moved = moved_localids(folder)
        # public localId es 1-based en orden de object_events
        for idx, obj in enumerate(pub.get("objects", [])):
            if not isinstance(obj, dict) or obj.get("clone"):
                continue
            gfx = obj.get("graphicsName", "")
            trainer = to_int(obj.get("trainerType", 0))
            flag_num = to_int(obj.get("flag", 0))
            dobj = decomp_objs[idx] if idx < len(decomp_objs) else {}
            flag_name = dobj.get("flag", "0") if isinstance(dobj, dict) else "0"
            local_name = dobj.get("local_id", "") if isinstance(dobj, dict) else ""
            if gfx == "OBJ_EVENT_GFX_CUT_TREE":
                layer = "corte"
            elif gfx == "OBJ_EVENT_GFX_PUSHABLE_BOULDER":
                layer = "fuerza"
            elif gfx == "OBJ_EVENT_GFX_ROCK_SMASH_ROCK":
                layer = "golpe_roca"
            elif gfx == "OBJ_EVENT_GFX_SNORLAX":
                layer = "snorlax"
            elif trainer != 0:
                layer = "entrenador"
            elif flag_num != 0:
                layer = "npc_condicional"
            else:
                # Sin capa del plan salvo que lo mueva un script (§4.2:
                # el policia de Celeste no tiene flag pero si setobjectxyperm).
                moved_flag = local_name in moved if local_name else False
                if not moved_flag:
                    continue
                layer = "npc"
            el: dict = {
                "map": mid,
                "x": obj.get("x", 0),
                "y": obj.get("y", 0),
                "layer": layer,
                "localId": obj.get("localId", idx + 1),
                "graphics": gfx,
                "movedByScript": local_name in moved if local_name else False,
            }
            if flag_name != "0":
                el["flag"] = flag_name
                if flag_name in hidden_at_start:
                    el["startsHidden"] = True
            if layer == "entrenador":
                el["trainerRange"] = to_int(obj.get("trainerRange", 0))
                script_name = obj.get("scriptName") or (dobj.get("script", "") if isinstance(dobj, dict) else "")
                if script_name and script_name in trainer_of:
                    el["trainer"] = trainer_of[script_name]
                facing = FACING_BY_MOVEMENT.get(to_int(obj.get("movementType", 0), -1))
                if facing:
                    el["direction"] = facing
            elements.append(el)
        # activadores y puertas: nombres simbolicos del decomp
        if dm:
            for c in dm.get("coord_events", []):
                triggers.append(
                    {
                        "map": mid,
                        "x": to_int(c.get("x", 0)),
                        "y": to_int(c.get("y", 0)),
                        "var": c.get("var", ""),
                        "value": to_int(c.get("var_value", 0)),
                        "script": c.get("script", ""),
                    }
                )
            for w in dm.get("warp_events", []):
                dest = w.get("dest_map", "")
                elements.append(
                    {
                        "map": mid,
                        "x": to_int(w.get("x", 0)),
                        "y": to_int(w.get("y", 0)),
                        "layer": "puerta",
                        "destMap": dest,
                        "destName": maps[dest]["name"] if dest in maps else dest,
                    }
                )
        else:
            for c in pub.get("coords", []):
                triggers.append(
                    {
                        "map": mid,
                        "x": c.get("x", 0),
                        "y": c.get("y", 0),
                        "var": str(c.get("var", "")),
                        "value": c.get("value", 0),
                        "script": c.get("scriptName", ""),
                    }
                )
            for w in pub.get("warps", []):
                dest = w.get("destMap", "")
                elements.append(
                    {
                        "map": mid,
                        "x": w.get("x", 0),
                        "y": w.get("y", 0),
                        "layer": "puerta",
                        "destMap": dest,
                        "destName": maps[dest]["name"] if dest in maps else dest,
                    }
                )

    elements.sort(
        key=lambda e: (e["map"], e["y"], e["x"], e["layer"], e.get("localId", 0))
    )
    triggers.sort(key=lambda t: (t["map"], t["y"], t["x"], t["script"]))

    out = {
        "_meta": {
            "generator": "tools/viewer/world_index.py",
            "decomp_commit": decomp_commit(),
        },
        "world": {
            "width": maxx - minx,
            "height": maxy - miny,
            "origin": ORIGIN,
        },
        "maps": maps_out,
        "conflicts": conflicts,
        "elements": elements,
        "triggers": triggers,
        "writers": writers,
        "initialFlags": hidden_at_start,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps(out, separators=(",", ":"), ensure_ascii=False, sort_keys=False)
        + "\n"
    )
    print(f"{len(pos)} mapas, mundo {maxx - minx}x{maxy - miny}, "
          f"{len(conflicts)} conflictos, {len(elements)} elementos, "
          f"{len(triggers)} activadores -> {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
