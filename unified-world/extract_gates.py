#!/usr/bin/env python3
"""Static inventory of progress gates in the decomps (FireRed, Emerald, Heart & Soul).

Question answered: which map events can stop or redirect the player, and under which
condition? This is input for the unified-world decisions (docs/MUNDO-UNIFICADO.md):
field-move obstacles (A3), story blockers (A4) and badge/item doors.

It does NOT replace tools/viewer/quest_index.py (flag/var/script index and hand-tagged quest
classes); it only adds the event -> reachable-script analysis that file does not do.

Method (static, heuristic; no game is executed):
  1. Read every `data/maps/*/map.json` (object, coord and bg events) of the decomp.
  2. Read every script label (`data/maps/*/scripts.inc`, `data/scripts/*.inc`, `data/event_scripts.s`).
  3. From each event's script follow goto/call/call_if_*/goto_if_* up to MAX_DEPTH and union
     what is reachable: flags/vars checked, items checked, party moves checked, movements
     applied to the player, warps, trainers.
  4. Classify by evidence. A gate is only reported when a type fires.

Limits: no `switch/case` jump tables, no `special` side effects, no text; the depth bound and
shared scripts can add noise. Evidence is listed per gate so every result can be checked by hand.

Usage: python3 unified-world/extract_gates.py [firered|emerald|hns ...]
Output: unified-world/out/gates_<source>.json and unified-world/out/GATES.md
"""
from __future__ import annotations

import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "unified-world" / "out"
SOURCES = {
    "firered": ROOT / "pokefirered",
    "emerald": ROOT.parent / "refs-src" / "pokeemerald",
    "hns": ROOT.parent / "refs-src" / "pokemon-hns",
}
MAX_DEPTH = 8

LABEL = re.compile(r"^([A-Za-z_]\w*)::?\s*(?:@.*)?$")
CMD = re.compile(r"^\s*([A-Za-z_]\w*)\b\s*(.*?)\s*(?:@.*)?$")
PLAYER = {"LOCALID_PLAYER", "OBJ_EVENT_ID_PLAYER", "0xFF", "255"}
FLAG_JUMP = {"goto_if_set", "goto_if_unset", "call_if_set", "call_if_unset"}
VAR_JUMP = {"goto_if_eq", "goto_if_ne", "goto_if_lt", "goto_if_le", "goto_if_gt", "goto_if_ge",
            "call_if_eq", "call_if_ne", "call_if_lt", "call_if_le", "call_if_gt", "call_if_ge"}
STEP_PREFIXES = ("walk_", "jump_", "slide_", "run_", "ride_", "player_run", "walk_fast", "walk_slow")
BADGE = re.compile(r"FLAG_BADGE\d+_GET")
# Physical obstacles: they block by collision, so no script has to push the player back.
OBSTACLE_GFX = re.compile(r"OBJ_EVENT_GFX_(SNORLAX|CUT(TABLE)?_TREE|ROCK_SMASH_ROCK|BREAKABLE_ROCK|PUSHABLE_BOULDER|STRENGTH_BOULDER)$")
# Key items that are never progress gates (casino, berries, tools). Documented so the filter is auditable.
NON_GATING_KEY_ITEMS = {"ITEM_COIN_CASE", "ITEM_POKEBLOCK_CASE", "ITEM_POWDER_JAR", "ITEM_WAILMER_PAIL",
                        "ITEM_ITEMFINDER", "ITEM_TEACHY_TV", "ITEM_OLD_ROD", "ITEM_GOOD_ROD", "ITEM_SUPER_ROD"}


def ops(rest: str) -> list[str]:
    return [p.strip() for p in rest.split(",") if p.strip()]


def key_items(decomp: Path) -> set[str]:
    """Items whose pocket is the key-items pocket, from the decomp's own item table."""
    found: set[str] = set()
    js = decomp / "src" / "data" / "items.json"
    if js.exists():
        for it in json.loads(js.read_text(encoding="utf-8"))["items"]:
            if it.get("pocket") == "POCKET_KEY_ITEMS":
                found.add(it["itemId"])
    h = decomp / "src" / "data" / "items.h"
    if h.exists():
        cur = None
        for line in h.read_text(encoding="utf-8", errors="replace").splitlines():
            m = re.match(r"\s*\[(ITEM_\w+)\]\s*=", line)
            if m:
                cur = m.group(1)
            elif cur and "POCKET_KEY_ITEMS" in line:
                found.add(cur)
    return found - NON_GATING_KEY_ITEMS


def script_files(decomp: Path) -> list[Path]:
    files = sorted((decomp / "data" / "maps").glob("*/scripts.inc"))
    files += sorted((decomp / "data" / "scripts").glob("*.inc"))
    for extra in ("data/event_scripts.s",):
        if (decomp / extra).exists():
            files.append(decomp / extra)
    return files


def parse_scripts(decomp: Path) -> dict[str, dict]:
    labels: dict[str, dict] = {}
    for path in script_files(decomp):
        cur = None
        for raw in path.read_text(encoding="utf-8", errors="replace").splitlines():
            m = LABEL.match(raw)
            if m:
                cur = labels.setdefault(m.group(1), {
                    "cmds": [], "calls": [], "flags": [], "vars": [], "items": [], "moves": [],
                    "player": [], "warps": [], "trainers": [], "msgbox": 0})
                continue
            if cur is None:
                continue
            c = CMD.match(raw)
            if not c or c.group(1).startswith("."):
                continue
            cmd, o = c.group(1), ops(c.group(2))
            cur["cmds"].append(cmd)
            if cmd == "checkflag" and o:
                cur["flags"].append(o[0])
            elif cmd in FLAG_JUMP and len(o) >= 2:
                cur["flags"].append(o[0]); cur["calls"].append(o[1])
            elif cmd in VAR_JUMP and len(o) >= 3:
                cur["vars"].append([o[0], o[1]]); cur["calls"].append(o[2])
            elif cmd in ("compare", "switch") and o:
                cur["vars"].append([o[0], o[1] if len(o) > 1 else ""])
            elif cmd == "checkitem" and o:
                cur["items"].append(o[0])
            elif cmd == "checkpartymove" and o:
                cur["moves"].append(o[0])
            elif cmd == "applymovement" and len(o) >= 2 and o[0] in PLAYER:
                cur["player"].append(o[1])
            elif cmd in ("goto", "call") and o:
                cur["calls"].append(o[0])
            elif cmd.startswith("trainerbattle") and o:
                cur["trainers"].extend(t for t in o if re.fullmatch(r"TRAINER_[A-Z0-9_]+", t))
            elif cmd in ("warp", "warpsilent", "warpdoor", "warphole", "warpteleport") and o and o[0].startswith("MAP_"):
                cur["warps"].append(o[0])
            elif cmd == "msgbox":
                cur["msgbox"] += 1
    return labels


def reach(labels: dict[str, dict], start: str) -> dict:
    agg = {"flags": set(), "vars": set(), "items": set(), "moves": set(), "player": [],
           "warps": set(), "trainers": set(), "msgbox": 0, "labels": 0, "missing": []}
    seen: set[str] = set()
    stack = [(start, 0)]
    while stack:
        name, depth = stack.pop()
        if name in seen:
            continue
        seen.add(name)
        rec = labels.get(name)
        if rec is None:
            if depth == 0:
                agg["missing"].append(name)
            continue
        agg["labels"] += 1
        agg["flags"].update(rec["flags"])
        agg["vars"].update(tuple(v) for v in rec["vars"])
        agg["items"].update(rec["items"])
        agg["moves"].update(rec["moves"])
        for p in rec["player"]:
            if p not in agg["player"]:
                agg["player"].append(p)
        agg["warps"].update(rec["warps"])
        agg["trainers"].update(rec["trainers"])
        agg["msgbox"] += rec["msgbox"]
        if depth < MAX_DEPTH:
            stack.extend((t, depth + 1) for t in rec["calls"])
    return agg


def steps_player(labels: dict[str, dict], movement_labels: list[str]) -> list[str]:
    """Movement macros of the player's movements that actually displace it (not turn-only)."""
    found: list[str] = []
    for lbl in movement_labels:
        for c in labels.get(lbl, {}).get("cmds", []):
            if c.startswith(STEP_PREFIXES) and "in_place" not in c and c not in found:
                found.append(c)
    return found


def events(mj: dict):
    for o in mj.get("object_events", []):
        yield "object", o.get("script"), o
    for c in mj.get("coord_events", []):
        yield c.get("type", "coord"), c.get("script"), c
    for b in mj.get("bg_events", []):
        yield b.get("type", "bg"), b.get("script"), b


def analyse(source: str) -> dict:
    decomp = SOURCES[source]
    if not (decomp / "data" / "maps").exists():
        raise SystemExit(f"{source}: decomp not found at {decomp}")
    labels = parse_scripts(decomp)
    keys = key_items(decomp)
    gates: list[dict] = []
    totals = Counter()
    for mapdir in sorted((decomp / "data" / "maps").iterdir()):
        mfile = mapdir / "map.json"
        if not mfile.exists():
            continue
        mj = json.loads(mfile.read_text(encoding="utf-8"))
        for kind, script, ev in events(mj):
            if not script or script in ("0x0", "NULL", "0"):
                continue
            totals["events"] += 1
            r = reach(labels, script)
            steps = steps_player(labels, r["player"])
            badges = sorted(f for f in r["flags"] if BADGE.fullmatch(f))
            key_checked = sorted(i for i in r["items"] if i in keys)
            obstacle = kind == "object" and bool(OBSTACLE_GFX.search(ev.get("graphics_id") or ""))
            types = []
            if steps:
                types.append("forced_move")
            if r["moves"]:
                types.append("field_move")
            if obstacle:
                types.append("physical_obstacle")
            if badges and not r["moves"]:
                types.append("badge_check")
            if key_checked:
                types.append("item_check")
            if not types:
                continue
            totals["gates"] += 1
            own = {}
            if kind == "trigger" and ev.get("var"):
                own = {"var": ev["var"], "value": ev.get("var_value")}
            gates.append({
                "map": mj.get("id"), "mapName": mj.get("name"), "section": mj.get("region_map_section"),
                "event": {"kind": kind, "x": ev.get("x"), "y": ev.get("y"), "script": script,
                          "graphics": ev.get("graphics_id"), "hideFlag": ev.get("flag") if kind == "object" else None, **own},
                "types": types,
                "blocksMovement": bool(steps or r["moves"] or obstacle),
                "requires": {"badges": badges,
                             "flags": sorted(f for f in r["flags"] if f not in badges),
                             "badgesViaFieldMove": bool(badges and r["moves"]),
                             "vars": sorted([list(v) for v in r["vars"]]),
                             "items": key_checked, "partyMoves": sorted(r["moves"])},
                "evidence": {"playerSteps": steps, "playerMovementLabels": r["player"],
                             "warps": sorted(r["warps"]), "trainers": sorted(r["trainers"]),
                             "scriptsReached": r["labels"], "unresolved": r["missing"]},
            })
    return {"_meta": {"source": source, "decomp": str(decomp.relative_to(ROOT.parent)),
                      "generator": "unified-world/extract_gates.py", "maxDepth": MAX_DEPTH,
                      "method": "static call-graph reachability from map events; heuristic, see script docstring",
                      "keyItems": len(keys),
                      "mapsScripts": len(labels), "eventsWithScript": totals["events"], "gates": totals["gates"]},
            "gates": gates}


def report(results: dict[str, dict]) -> str:
    out = ["# Bloqueos de progreso (generado)", "",
           "Generado por `unified-world/extract_gates.py`; no editar a mano. Análisis **estático y heurístico**:",
           "cada fila lista la evidencia y debe confirmarse a mano antes de decidir.", "",
           "Tipos: `field_move` = el script comprueba un movimiento del equipo (Cortar, Fuerza…);",
           "`forced_move` = el script desplaza al jugador (rebote o escena; **no siempre es un bloqueo**);",
           "`physical_obstacle` = objeto que bloquea por colisión (Snorlax, árbol, roca, bloque);",
           "`badge_check` = comprueba una medalla fuera de un movimiento de campo; `item_check` = comprueba un **objeto clave**.",
           "", "**No capta:** guardias o NPC que bloquean solo por colisión y se retiran al activar un flag, ni condiciones",
           "dentro de `switch/case` o `special`. Esos casos requieren una lista manual.", ""]
    for source, data in results.items():
        g = data["gates"]
        out += [f"## {source}", "",
                f"{data['_meta']['eventsWithScript']} eventos con script, {len(g)} con alguna señal.", ""]
        c = Counter(t for x in g for t in x["types"])
        out += ["| Tipo | Eventos |", "|---|---:|"] + [f"| {t} | {n} |" for t, n in sorted(c.items())] + [""]
        by_move: Counter = Counter(m for x in g for m in x["requires"]["partyMoves"])
        if by_move:
            out += ["Obstáculos de movimiento de campo (decisión A3):", "",
                    "| Movimiento | Eventos |", "|---|---:|"] + [f"| {m} | {n} |" for m, n in by_move.most_common()] + [""]
        story = [x for x in g if "forced_move" in x["types"] and x["event"]["kind"] == "trigger" and x["event"].get("var")]
        out += [f"Rebotes por variable de escena en eventos de coordenada ({len(story)}; decisión A4):", "",
                "| Mapa | Casilla | Variable = valor | Otras condiciones |", "|---|---|---|---|"]
        for x in story:
            e = x["event"]
            other = ", ".join((x["requires"]["badges"] + x["requires"]["flags"] + x["requires"]["items"])[:4])
            out.append(f"| {x['mapName']} | {e['x']},{e['y']} | {e['var']} = {e['value']} | {other} |")
        out.append("")
        doors = [x for x in g if x["requires"]["badges"] or x["requires"]["items"]]
        out += [f"Comprobaciones de medalla u objeto ({len(doors)}):", "",
                "| Mapa | Evento | Medallas | Objetos |", "|---|---|---|---|"]
        for x in doors[:200]:
            e = x["event"]
            out.append(f"| {x['mapName']} | {e['kind']} {e['x']},{e['y']} | {', '.join(x['requires']['badges'])} | "
                       f"{', '.join(x['requires']['items'])} |")
        if len(doors) > 200:
            out.append(f"| … | {len(doors) - 200} filas más en el JSON | | |")
        out.append("")
    return "\n".join(out) + "\n"


def main(argv: list[str]) -> int:
    wanted = argv[1:] or list(SOURCES)
    OUT.mkdir(parents=True, exist_ok=True)
    results = {}
    for s in wanted:
        data = analyse(s)
        (OUT / f"gates_{s}.json").write_text(json.dumps(data, indent=1, sort_keys=True) + "\n")
        results[s] = data
        print(f"{s}: {data['_meta']['eventsWithScript']} events, {data['_meta']['gates']} with signals")
    (OUT / "GATES.md").write_text(report(results))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
