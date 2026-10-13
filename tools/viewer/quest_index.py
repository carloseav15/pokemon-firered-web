#!/usr/bin/env python3
"""Index of flags, variables and scripts for the quest library (quests.html).

Reads the decomp's event scripts (data/maps/*/scripts.inc and data/scripts/*.inc) and, per script label, records which
flags/variables it sets, clears or checks, which items/Pokémon/trainers it hands out or fights, where it warps and which
other scripts it calls. Only identifiers are kept (no message text). Then it groups flags into quest candidates.

Usage: [EXPORT_GAME=emerald] python3 tools/viewer/quest_index.py   -> public/viewer/quests_<game>.json
The "obligatoria/opcional" suggestion is a naming/reachability heuristic and is overridden by tools/viewer/quest_tags.json.
"""
from __future__ import annotations

import json
import re
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "decomp"))
from common import DECOMP, GAME, OUT as GAME_OUT, ROOT  # noqa: E402

OUT = ROOT / "public" / "viewer" / f"quests_{GAME}.json"
TAGS = ROOT / "tools" / "viewer" / "quest_tags.json"

LABEL = re.compile(r"^([A-Za-z_]\w*)::?\s*$")
CMD = re.compile(r"^\s*(\w+)\s*(.*?)\s*(?:@.*)?$")
FLAG_SET = {"setflag"}
FLAG_CLEAR = {"clearflag"}
FLAG_CHECK = {"checkflag"}
FLAG_JUMP = {"goto_if_set", "goto_if_unset", "call_if_set", "call_if_unset"}
VAR_JUMP = {"goto_if_eq", "goto_if_ne", "goto_if_lt", "goto_if_le", "goto_if_gt", "goto_if_ge",
            "call_if_eq", "call_if_ne", "call_if_lt", "call_if_le", "call_if_gt", "call_if_ge"}


def operands(rest: str) -> list[str]:
    return [p.strip() for p in rest.split(",") if p.strip()]


def parse() -> dict[str, dict]:
    files: list[tuple[str, Path]] = []
    maps_dir = DECOMP / "data" / "maps"
    for d in sorted(maps_dir.iterdir()):
        if (d / "scripts.inc").exists():
            files.append((d.name, d / "scripts.inc"))
    sdir = DECOMP / "data" / "scripts"
    if sdir.exists():
        files += [(p.stem, p) for p in sorted(sdir.glob("*.inc"))]
    for extra in ("data/event_scripts.s",):
        if (DECOMP / extra).exists():
            files.append(("event_scripts", DECOMP / extra))
    scripts: dict[str, dict] = {}
    for area, path in files:
        cur: dict | None = None
        for n, raw in enumerate(path.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
            m = LABEL.match(raw)
            if m:
                cur = scripts.setdefault(m.group(1), {"map": area, "line": n, "sets": [], "clears": [], "checks": [], "varSets": [],
                                                      "varChecks": [], "items": [], "mons": [], "trainers": [], "warps": [],
                                                      "calls": [], "specials": []})
                continue
            if cur is None:
                continue
            c = CMD.match(raw)
            if not c or c.group(1).startswith("."):
                continue
            cmd, ops = c.group(1), operands(c.group(2))
            if cmd in FLAG_SET and ops:
                cur["sets"].append(ops[0])
            elif cmd in FLAG_CLEAR and ops:
                cur["clears"].append(ops[0])
            elif cmd in FLAG_CHECK and ops:
                cur["checks"].append(ops[0])
            elif cmd in FLAG_JUMP and len(ops) >= 2:
                cur["checks"].append(ops[0])
                cur["calls"].append(ops[1])
            elif cmd in VAR_JUMP and len(ops) >= 3:
                cur["varChecks"].append(ops[0])
                cur["calls"].append(ops[2])
            elif cmd == "compare" and ops:
                cur["varChecks"].append(ops[0])
            elif cmd == "setvar" and len(ops) >= 2:
                cur["varSets"].append([ops[0], ops[1]])
            elif cmd in ("giveitem", "giveitem_std", "additem", "giveitem_msg") and ops and ops[0].startswith("ITEM_"):
                cur["items"].append(ops[0])
            elif cmd in ("givemon", "giveegg") and ops:
                cur["mons"].append(ops[0])
            elif cmd.startswith("trainerbattle") and ops:
                t = [o for o in ops if re.fullmatch(r"TRAINER_[A-Z0-9_]+", o) and not o.startswith("TRAINER_BATTLE_")]
                if t:
                    cur["trainers"].append(t[0])
            elif cmd in ("warp", "warpsilent", "warpdoor", "warphole", "warpteleport", "setwarp", "setdynamicwarp", "setholewarp") and ops and ops[0].startswith("MAP_"):
                cur["warps"].append(ops[0])
            elif cmd in ("goto", "call") and ops:
                cur["calls"].append(ops[0])
            elif cmd in ("special", "specialvar") and ops:
                cur["specials"].append(ops[-1])
    return scripts


def kind_of(name: str) -> str:
    if re.fullmatch(r"FLAG_BADGE\d+_GET", name):
        return "badge"
    if name.startswith(("FLAG_GOT_", "FLAG_RECEIVED_", "FLAG_OBTAINED_", "FLAG_BOUGHT_")):
        return "regalo"
    if name.startswith(("FLAG_DEFEATED_", "FLAG_BEAT_", "FLAG_RESCUED_", "FLAG_CAUGHT_", "FLAG_LEGENDARY_")):
        return "combate"
    if name.startswith("FLAG_HIDE_") or name.startswith("FLAG_SHOW_"):
        return "aparicion"
    if name.startswith("FLAG_SYS_"):
        return "sistema"
    if name.startswith("FLAG_VISITED_") or name.startswith("FLAG_WORLD_MAP_"):
        return "visita"
    if name.startswith("FLAG_TEMP_") or name.startswith("FLAG_DAILY_"):
        return "temporal"
    if name.startswith("FLAG_ITEM_"):
        return "objeto-suelo"
    if name.startswith("FLAG_TRAINER_"):
        return "entrenador"
    return "otro"


def main() -> int:
    scripts = parse()
    flags: dict[str, dict] = defaultdict(lambda: {"setBy": [], "clearedBy": [], "checkedBy": []})
    vars_: dict[str, dict] = defaultdict(lambda: {"setBy": [], "checkedBy": []})
    for label, s in scripts.items():
        for f in s["sets"]:
            flags[f]["setBy"].append(label)
        for f in s["clears"]:
            flags[f]["clearedBy"].append(label)
        for f in s["checks"]:
            flags[f]["checkedBy"].append(label)
        for v, val in s["varSets"]:
            vars_[v]["setBy"].append([label, val])
        for v in s["varChecks"]:
            vars_[v]["checkedBy"].append(label)
    # objetos de mapa que dependen de un flag y eventos de coordenada que esperan una variable
    hides: dict[str, list] = defaultdict(list)
    gates: dict[str, list] = defaultdict(list)
    for p in sorted((GAME_OUT / "maps").glob("MAP_*.json")):
        m = json.loads(p.read_text())
        for o in m["objects"]:
            if o.get("clone"):
                continue
            if o.get("flag") not in (None, 0, "0"):
                hides[str(o["flag"])].append({"map": m["id"], "localId": o["localId"], "graphics": o["graphicsName"], "script": o.get("scriptName")})
        for c in m["coords"]:
            if "var" not in c:  # Emerald's weather coordinate events have no variable
                continue
            gates[str(c["var"])].append({"map": m["id"], "x": c["x"], "y": c["y"], "value": c["value"], "script": c.get("scriptName")})
    consts = json.loads((GAME_OUT / "constants.json").read_text())
    flag_by_value = {v: k for k, v in consts.items() if k.startswith("FLAG_")}
    var_by_value = {v: k for k, v in consts.items() if k.startswith("VAR_")}
    for k in list(hides):
        name = flag_by_value.get(int(k)) if k.isdigit() else k
        if name:
            hides[name] = hides.pop(k)
    for k in list(gates):
        name = var_by_value.get(int(k)) if k.isdigit() else k
        if name:
            gates[name] = gates.pop(k)
    tags = json.loads(TAGS.read_text()) if TAGS.exists() else {}
    flag_out = {}
    for name, d in sorted(flags.items()):
        flag_out[name] = {"kind": kind_of(name), **d, "hides": hides.get(name, [])}
    var_out = {}
    for name, d in sorted(vars_.items()):
        var_out[name] = {**d, "gates": gates.get(name, [])}
    for name, g in gates.items():
        var_out.setdefault(name, {"setBy": [], "checkedBy": [], "gates": g})
    # quests: una por flag «clave» con al menos un script que la activa
    quests = []
    for name, f in flag_out.items():
        if f["kind"] not in ("badge", "regalo", "combate") or not f["setBy"]:
            continue
        setters = f["setBy"]
        prereq_flags, prereq_vars, effects, items, mons, trainers, warps, maps = set(), set(), set(), set(), set(), set(), set(), set()
        for label in setters:
            s = scripts[label]
            maps.add(s["map"])
            prereq_flags.update(c for c in s["checks"] if c != name)
            prereq_vars.update(s["varChecks"])
            effects.update(x for x in s["clears"] + s["sets"] if x != name)
            items.update(s["items"])
            mons.update(s["mons"])
            trainers.update(s["trainers"])
            warps.update(s["warps"])
        suggested = "obligatoria" if f["kind"] == "badge" else "opcional" if f["kind"] == "regalo" else "desconocido"
        quests.append({
            "id": name, "kind": f["kind"], "start": setters[0], "map": scripts[setters[0]]["map"], "maps": sorted(maps),
            "requiresFlags": sorted(prereq_flags), "requiresVars": sorted(prereq_vars), "effects": sorted(effects),
            "items": sorted(items), "mons": sorted(mons), "trainers": sorted(trainers), "warps": sorted(warps),
            "suggested": tags.get(name, {}).get("class", suggested), "tagged": name in tags,
        })
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({
        "_meta": {"generator": "tools/viewer/quest_index.py", "game": GAME,
                  "note": "identificadores de scripts del decomp; 'suggested' es una heurística, ver quest_tags.json"},
        "scripts": scripts, "flags": flag_out, "vars": var_out, "quests": quests,
    }, separators=(",", ":"), sort_keys=True) + "\n")
    print(f"{OUT.relative_to(ROOT)}: {len(scripts)} scripts, {len(flag_out)} flags, {len(var_out)} vars, {len(quests)} quests "
          f"({OUT.stat().st_size // 1024} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
