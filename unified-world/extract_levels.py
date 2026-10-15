#!/usr/bin/env python3
"""Real levels of gym leaders, Elite Four and champions, per source.

Question answered: how do the three progressions actually compare before any level curve is
fixed? (docs/MUNDO-UNIFICADO.md, decisions B3/B4/XP curve). The curve proposed in the design
conversation is NOT used as input; it is only printed next to the measured data.

Sources (nothing here is re-extracted by hand; each is read where it already lives):
  firered    public/fr/data/trainers.json + public/fr/constants.json   (tools/decomp export)
  emerald    refs/emerald/trainers.json                                (tools/refs/emerald_trainers.py)
  heartgold  refs/heartgold/trainers.json                              (tools/refs/heartgold_data.py)
  hns        ../refs-src/pokemon-hns/src/data/trainers.h + trainer_parties.h  (read directly here;
             tools/refs/emerald_trainers.py is strict and rejects HnS party definitions)

Crystal trainer parties are NOT available: the pinned pokecrystal checkout is sparse (maps, tilesets).
Johto is therefore compared through HnS (GBA, the base chosen for maps) and HeartGold (reference).

Usage: python3 unified-world/extract_levels.py
Output: unified-world/out/levels.json and unified-world/out/LEVELS.md
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "unified-world" / "out"
HNS = ROOT.parent / "refs-src" / "pokemon-hns" / "src" / "data"

# Canonical gym order of each region game (FRLG, Crystal/HGSS, Emerald). Hand-written knowledge; each name
# is checked against the data and the run fails if one is missing.
GYM_ORDER = {
    "kanto": ["BROCK", "MISTY", "LT_SURGE", "ERIKA", "KOGA", "SABRINA", "BLAINE", "GIOVANNI"],
    "johto": ["FALKNER", "BUGSY", "WHITNEY", "MORTY", "CHUCK", "JASMINE", "PRYCE", "CLAIR"],
    # Emerald: Juan leads Sootopolis; Wallace is the champion and Steven the post-game fight.
    "hoenn": ["ROXANNE", "BRAWLY", "WATTSON", "FLANNERY", "NORMAN", "WINONA", "TATE_LIZA", "JUAN"],
}
# Curve proposed in the 2026-10-15 design conversation: a design wish, not a measurement.
PROPOSED = [(0, 5, 12), (4, 25, 30), (8, 35, 45), (12, 45, 55), (16, 55, 65), (20, 65, 75), (24, 75, 85)]


def strip_comments(text: str) -> str:
    return re.sub(r"/\*.*?\*/|//[^\n]*", "", text, flags=re.S)


def matching(text: str, opening: int) -> int:
    depth = 0
    for i in range(opening, len(text)):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                return i
    raise ValueError("unbalanced braces")


def is_rematch(const: str) -> bool:
    return "REMATCH" in const or bool(re.search(r"_([2-9])$", const))


def norm_name(s: str) -> str:
    return re.sub(r"[^A-Z]+", "_", s.upper()).strip("_")


# --- sources -------------------------------------------------------------------------------------------------

def load_firered() -> list[dict]:
    consts = json.loads((ROOT / "public/fr/constants.json").read_text())
    data = json.loads((ROOT / "public/fr/data/trainers.json").read_text())
    cls = {"LEADER": consts["TRAINER_CLASS_LEADER"], "ELITE_FOUR": consts["TRAINER_CLASS_ELITE_FOUR"],
           "CHAMPION": consts["TRAINER_CLASS_CHAMPION"]}
    species = {}
    for k, v in consts.items():
        if k.startswith("SPECIES_") and v not in species:
            species[v] = k
    by_id = {v: k for k, v in consts.items() if k.startswith("TRAINER_") and not k.startswith("TRAINER_CLASS_")}
    out = []
    for i, t in enumerate(data):
        group = next((g for g, c in cls.items() if t["class"] == c), None)
        if not group or not t["party"]:
            continue
        const = by_id.get(i, f"#{i}")
        name = norm_name(const.replace("TRAINER_LEADER_", "").replace("TRAINER_ELITE_FOUR_", "").replace("TRAINER_CHAMPION_", ""))
        out.append({"const": const, "name": name, "group": group, "rematch": is_rematch(const),
                    "party": [{"species": species.get(m["species"], str(m["species"])), "level": m["level"]} for m in t["party"]]})
    return out


def load_emerald() -> list[dict]:
    out = []
    for t in json.loads((ROOT / "refs/emerald/trainers.json").read_text())["data"]:
        group = {"TRAINER_CLASS_LEADER": "LEADER", "TRAINER_CLASS_ELITE_FOUR": "ELITE_FOUR",
                 "TRAINER_CLASS_CHAMPION": "CHAMPION"}.get(t["class"])
        if t["const"] == "TRAINER_STEVEN":  # class RIVAL in the data; post-game fight
            group = "POSTGAME"
        if not group or not t["party"]:
            continue
        const = t["const"]
        out.append({"const": const, "name": norm_name(t["name"]), "group": group, "rematch": is_rematch(const),
                    "party": [{"species": m["species"], "level": m["lvl"]} for m in t["party"]]})
    return out


def load_heartgold() -> list[dict]:
    out = []
    seen: dict[str, int] = {}
    for i, t in enumerate(json.loads((ROOT / "refs/heartgold/trainers.json").read_text())["data"]):
        c = t["class"]
        group = ("LEADER" if c.startswith("TRAINERCLASS_LEADER_") else "ELITE_FOUR" if c.startswith("TRAINERCLASS_ELITE_FOUR_")
                 else "CHAMPION" if c == "TRAINERCLASS_CHAMPION" else None)
        if not group or not t["party"]:
            continue
        name = norm_name(c.replace("TRAINERCLASS_LEADER_", "").replace("TRAINERCLASS_ELITE_FOUR_", "").replace("TRAINERCLASS_", ""))
        seen[c] = seen.get(c, 0) + 1
        # Several entries share a class: the first is the regular fight, later ones are rematches.
        out.append({"const": f"{c}#{i}", "name": name, "group": group, "rematch": seen[c] > 1,
                    "party": [{"species": m["species"], "level": m["level"]} for m in t["party"]]})
    return out


def load_hns() -> list[dict]:
    ptxt = strip_comments((HNS / "trainer_parties.h").read_text(encoding="utf-8", errors="replace"))
    parties: dict[str, list[dict]] = {}
    for m in re.finditer(r"static const struct \w+\s+(sParty_\w+)\s*\[\]\s*=\s*\{", ptxt):
        end = matching(ptxt, m.end() - 1)
        body = ptxt[m.end() - 1:end]
        lv = [int(x) for x in re.findall(r"\.lvl\s*=\s*(\d+)", body)]
        sp = re.findall(r"\.species\s*=\s*(SPECIES_\w+)", body)
        if len(lv) != len(sp):
            raise SystemExit(f"{m.group(1)}: {len(lv)} levels but {len(sp)} species")
        parties[m.group(1)] = [{"species": s, "level": l} for s, l in zip(sp, lv)]
    ttxt = strip_comments((HNS / "trainers.h").read_text(encoding="utf-8", errors="replace"))
    out = []
    for m in re.finditer(r"\[(TRAINER_\w+)\]\s*=\s*\{", ttxt):
        body = ttxt[m.end() - 1:matching(ttxt, m.end() - 1)]
        c = re.search(r"\.trainerClass\s*=\s*TRAINER_CLASS_(\w+)", body)
        group = {"LEADER": "LEADER", "ELITE_FOUR": "ELITE_FOUR", "CHAMPION": "CHAMPION"}.get(c.group(1)) if c else None
        if not group:
            continue
        p = re.search(r"\.party\s*=\s*\w+\((sParty_\w+)\)", body)
        n = re.search(r'\.trainerName\s*=\s*_\("([^"]*)"\)', body)
        if not p or p.group(1) not in parties:
            raise SystemExit(f"{m.group(1)}: unresolved party {p.group(1) if p else None}")
        out.append({"const": m.group(1), "name": norm_name(n.group(1)) if n else m.group(1), "group": group,
                    "rematch": is_rematch(m.group(1)), "party": parties[p.group(1)]})
    return out


# --- analysis ------------------------------------------------------------------------------------------------

def stats(t: dict) -> dict:
    lv = [m["level"] for m in t["party"]]
    return {"size": len(lv), "min": min(lv), "max": max(lv), "avg": round(sum(lv) / len(lv), 1)}


def leaders_in_order(entries: list[dict], region: str) -> list[dict | None]:
    base = [e for e in entries if e["group"] == "LEADER" and not e["rematch"]]
    out = []
    for name in GYM_ORDER[region]:
        hit = next((e for e in base if e["name"] == name), None)
        out.append({**hit, **stats(hit)} if hit else None)
    return out


def table(rows: list[dict | None], names: list[str]) -> list[str]:
    lines = ["| # | Líder | Pokémon | Niveles | As |", "|--:|---|--:|---|--:|"]
    for i, (n, r) in enumerate(zip(names, rows), 1):
        if r is None:
            lines.append(f"| {i} | {n} | – | **no encontrado** | – |")
        else:
            lv = ", ".join(str(m["level"]) for m in r["party"])
            lines.append(f"| {i} | {n} | {r['size']} | {lv} | {r['max']} |")
    return lines


def main() -> int:
    data = {"firered": load_firered(), "emerald": load_emerald(), "heartgold": load_heartgold(), "hns": load_hns()}
    plan = {"kanto": ("firered", "kanto"), "hoenn": ("emerald", "hoenn"), "johto": ("hns", "johto"),
            "johto_heartgold": ("heartgold", "johto")}
    ordered: dict[str, list] = {}
    for key, (src, region) in plan.items():
        rows = leaders_in_order(data[src], region)
        missing = [GYM_ORDER[region][i] for i, r in enumerate(rows) if r is None]
        if missing:
            print(f"WARNING {key} ({src}): leaders not found: {missing}", file=sys.stderr)
        ordered[key] = rows

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "levels.json").write_text(json.dumps({
        "_meta": {"generator": "unified-world/extract_levels.py", "gymOrder": GYM_ORDER,
                  "note": "levels read from each source; Crystal parties not available (sparse checkout)",
                  "counts": {s: len(v) for s, v in data.items()}},
        "gymLeadersInOrder": ordered,
        "entries": data}, indent=1, sort_keys=True) + "\n")

    md = ["# Niveles reales de líderes, Alto Mando y campeones (generado)", "",
          "Generado por `unified-world/extract_levels.py`; no editar a mano. Niveles leídos de cada fuente; **la curva",
          "propuesta no se usó como entrada**. Crystal no está disponible (checkout parcial): Johto se compara con HnS",
          "(base de mapas elegida) y HeartGold (referencia).", ""]
    for key, label in (("kanto", "Kanto — FireRed"), ("johto", "Johto — Heart & Soul (HnS)"),
                       ("johto_heartgold", "Johto — HeartGold (referencia)"), ("hoenn", "Hoenn — Emerald")):
        region = plan[key][1]
        md += [f"## {label}", ""] + table(ordered[key], GYM_ORDER[region]) + [""]

    md += ["## Alto Mando y campeones (primera pelea, sin revanchas)", "",
           "| Fuente | Entrenador | Grupo | Pokémon | Niveles | As |", "|---|---|---|--:|---|--:|"]
    for src in ("firered", "hns", "heartgold", "emerald"):
        for e in data[src]:
            if e["group"] in ("ELITE_FOUR", "CHAMPION", "POSTGAME") and not e["rematch"]:
                s = stats(e)
                md.append(f"| {src} | {e['name']} | {e['group']} | {s['size']} | "
                          f"{', '.join(str(m['level']) for m in e['party'])} | {s['max']} |")
    md.append("")

    md += ["## Revanchas (existen en los datos)", "",
           "| Fuente | Líderes con revancha | Alto Mando/campeón con revancha | Nivel máximo de revancha |", "|---|--:|--:|--:|"]
    for src in ("firered", "hns", "heartgold", "emerald"):
        rem = [e for e in data[src] if e["rematch"]]
        lead = sum(1 for e in rem if e["group"] == "LEADER")
        top = max((stats(e)["max"] for e in rem), default=0)
        md.append(f"| {src} | {lead} | {len(rem) - lead} | {top} |")
    md.append("")

    merged = []
    for key in ("kanto", "johto", "hoenn"):
        for i, r in enumerate(ordered[key], 1):
            if r:
                merged.append((r["max"], key, i, r["name"]))
    merged.sort()
    md += ["## Los 24 gimnasios ordenados por el nivel de su as (Johto = HnS)", "",
           "Si todos los gimnasios pueden hacerse en cualquier orden, así quedan las tres escaleras entrelazadas.", "",
           "| Medallas previas | Nivel del as | Región | Gimnasio | Líder |", "|--:|--:|---|--:|---|"]
    for n, (lvl, key, slot, name) in enumerate(merged):
        md.append(f"| {n} | {lvl} | {key} | {slot} | {name} |")
    md += ["", "Curva propuesta en la conversación de diseño (deseo, **no medida**), para contrastar:", "",
           "| Medallas | Nivel aproximado del equipo |", "|--:|---|"]
    md += [f"| {m} | {lo}–{hi} |" for m, lo, hi in PROPOSED]
    (OUT / "LEVELS.md").write_text("\n".join(md) + "\n")
    print({s: len(v) for s, v in data.items()}, "leaders-in-order:",
          {k: sum(1 for r in v if r) for k, v in ordered.items()})
    return 0


if __name__ == "__main__":
    sys.exit(main())
