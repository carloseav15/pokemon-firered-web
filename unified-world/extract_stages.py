#!/usr/bin/env python3
"""Gym stage ladder built from the real leader teams (docs/MUNDO-UNIFICADO.md, B3/B4).

Rule being tested: a leader challenged when the player already holds N medals fields an ace at the level
of the (N+1)-th gym of the *natural* ladder, i.e. the 24 original aces sorted by level. Four stages group N
(0-3, 4-7, 8-15, 16-23), as agreed. Nothing is invented for the ladder; it is the measured distribution.

For every leader and stage the script reports either
  real   an existing team of that leader (original or rematch, from any source) whose ace already fits, or
  draft  the closest real team shifted in level, with party size from the measured ladder, evolution lines
         re-fitted to the new levels, and members borrowed from the leader's other real teams when it is short.
Drafts are mechanical and **unreviewed**: no moves, items or strategy are designed here.

Assumptions that are mine (flagged in the output, change them in the constants below):
  NON_LEVEL_EVO_FLOOR  level below which trade/stone/friendship evolutions step back to the earlier form.
  ADDED_LEVEL_OFFSET   level of a borrowed member relative to the ace.
Species evolution data is FireRed's (Gen 1-3); later-generation species in HnS are kept as they are.

Needs out/levels.json (run extract_levels.py first). Output: out/stages.json and out/STAGES.md
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "unified-world" / "out"

STAGES = [(1, 0, 3), (2, 4, 7), (3, 8, 15), (4, 16, 23)]
NON_LEVEL_EVO_FLOOR = 30
ADDED_LEVEL_OFFSET = -2
REAL_TOLERANCE = 2
ALIASES = {"LTSURGE": "LT_SURGE", "TATE_LIZA": "TATE_LIZA"}
EVO_LEVEL = 4  # EVO_LEVEL in FireRed's constants


def load_species_lines():
    consts = json.loads((ROOT / "public/fr/constants.json").read_text())
    species = json.loads((ROOT / "public/fr/data/species.json").read_text())["species"]
    by_id: dict[int, str] = {}
    for k, v in consts.items():
        if k.startswith("SPECIES_") and v not in by_id:
            by_id[v] = k
    nxt: dict[str, list[tuple[str, int | None]]] = {}
    prev: dict[str, tuple[str, int | None]] = {}
    for sid, rec in enumerate(species):
        name = by_id.get(sid)
        if not name:
            continue
        for method, param, target in rec["evolutions"]:
            tname = by_id.get(target)
            if not tname:
                continue
            lvl = param if method == EVO_LEVEL else None
            nxt.setdefault(name, []).append((tname, lvl))
            prev.setdefault(tname, (name, lvl))
    return nxt, prev


def refit(species: str, level: int, nxt, prev) -> tuple[str, str | None]:
    """Move along the evolution line so the form matches the level; returns (species, note)."""
    start = species
    if species not in nxt and species not in prev:
        return species, "sin datos de evolución (especie fuera de FireRed)"
    for _ in range(4):  # step back
        p = prev.get(species)
        if not p:
            break
        pname, plvl = p
        threshold = plvl if plvl is not None else NON_LEVEL_EVO_FLOOR
        if level < threshold:
            species = pname
        else:
            break
    for _ in range(4):  # step forward (level evolutions only)
        options = [(t, l) for t, l in nxt.get(species, []) if l is not None and level >= l]
        if len(options) != 1:
            break
        species = options[0][0]
    return species, (f"{start} → {species}" if species != start else None)


def root_of(species: str, prev) -> str:
    for _ in range(4):
        p = prev.get(species)
        if not p:
            break
        species = p[0]
    return species


def main() -> int:
    lv = json.loads((OUT / "levels.json").read_text())
    entries = lv["entries"]
    order = lv["_meta"]["gymOrder"]
    nxt, prev = load_species_lines()

    def norm(n: str) -> str:
        return ALIASES.get(n, n)

    # natural ladder: original aces of the three chosen sources
    chosen = {"kanto": "firered", "johto": "hns", "hoenn": "emerald"}
    natural = []
    for region, names in order.items():
        for slot, name in enumerate(names, 1):
            base = next(e for e in entries[chosen[region]]
                        if e["group"] == "LEADER" and not e["rematch"] and norm(e["name"]) == name)
            natural.append({"region": region, "slot": slot, "name": name,
                            "ace": max(m["level"] for m in base["party"]), "size": len(base["party"])})
    ladder = sorted(natural, key=lambda x: (x["ace"], x["region"], x["slot"]))
    A = [x["ace"] for x in ladder]
    stage_info = []
    for sid, n0, n1 in STAGES:
        sizes = [x["size"] for x in ladder[n0:n1 + 1]]
        stage_info.append({"stage": sid, "medals": [n0, n1], "aceBand": [A[n0], A[n1]],
                           "aceMid": round((A[n0] + A[n1]) / 2), "partySize": int(sum(sizes) / len(sizes) + 0.5),
                           "partySizeMeasured": {"min": min(sizes), "max": max(sizes)}})

    leaders = []
    for region, names in order.items():
        for slot, name in enumerate(names, 1):
            teams = []
            for src, es in entries.items():
                for e in es:
                    if e["group"] == "LEADER" and norm(e["name"]) == name:
                        teams.append({"source": src, "const": e["const"], "rematch": e["rematch"],
                                      "ace": max(m["level"] for m in e["party"]), "party": e["party"]})
            teams.sort(key=lambda t: (t["ace"], t["source"], t["const"]))
            per_stage = []
            used: set[str] = set()
            for st in stage_info:
                lo, hi = st["aceBand"]
                real = [t for t in teams if lo - REAL_TOLERANCE <= t["ace"] <= hi + REAL_TOLERANCE]
                fresh = [t for t in real if t["const"] not in used] or real
                if fresh:
                    # the region's chosen source first, then closeness to the stage's mid ace
                    t = min(fresh, key=lambda x: (x["source"] != chosen[region], abs(x["ace"] - st["aceMid"])))
                    used.add(t["const"])
                    per_stage.append({"stage": st["stage"], "kind": "real", "from": {"source": t["source"], "const": t["const"]},
                                      "ace": t["ace"], "party": t["party"]})
                    continue
                base = min(teams, key=lambda x: (abs(x["ace"] - st["aceMid"]), x["rematch"]))
                delta = st["aceMid"] - base["ace"]
                mons = [{"species": m["species"], "level": max(2, min(100, m["level"] + delta)), "notes": []}
                        for m in base["party"]]
                size = st["partySize"]
                if len(mons) > size:  # keep the highest-level members (the ace always stays)
                    mons = sorted(mons, key=lambda m: -m["level"])[:size]
                have = {root_of(m["species"], prev) for m in mons}
                pool = [m for t in teams if t is not base for m in t["party"]]
                pool.sort(key=lambda m: -m["level"])
                for m in pool:
                    if len(mons) >= size:
                        break
                    if root_of(m["species"], prev) in have:  # same evolution line already in the team
                        continue
                    have.add(root_of(m["species"], prev))
                    mons.append({"species": m["species"], "level": max(2, st["aceMid"] + ADDED_LEVEL_OFFSET),
                                 "notes": ["añadido de otro equipo del líder"]})
                for m in mons:
                    new, note = refit(m["species"], m["level"], nxt, prev)
                    if note:
                        m["notes"].append(note)
                    m["species"] = new
                flags = []
                if len(mons) < size:
                    flags.append(f"faltan {size - len(mons)} miembros: requiere diseño")
                per_stage.append({"stage": st["stage"], "kind": "draft",
                                  "from": {"source": base["source"], "const": base["const"], "levelDelta": delta},
                                  "ace": max(m["level"] for m in mons), "party": mons, "flags": flags})
            leaders.append({"region": region, "slot": slot, "name": name, "naturalAce": next(
                x["ace"] for x in natural if x["name"] == name), "teamsAvailable": len(teams), "stages": per_stage})

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "stages.json").write_text(json.dumps({
        "_meta": {"generator": "unified-world/extract_stages.py", "stages": STAGES, "ladder": A,
                  "assumptions": {"NON_LEVEL_EVO_FLOOR": NON_LEVEL_EVO_FLOOR, "ADDED_LEVEL_OFFSET": ADDED_LEVEL_OFFSET,
                                  "REAL_TOLERANCE": REAL_TOLERANCE},
                  "note": "drafts are mechanical and unreviewed; no moves, items or strategy are designed; "
                          "draft levels use each stage's mid ace, the runtime level would follow the ladder"},
        "stageInfo": stage_info, "leaders": leaders}, indent=1, sort_keys=True) + "\n")

    short = lambda s: s.replace("SPECIES_", "").title().replace("_", " ")  # noqa: E731
    md = ["# Etapas de gimnasio (generado)", "",
          "Generado por `unified-world/extract_stages.py` a partir de `levels.json`; no editar a mano.", "",
          "Regla: con **N** medallas, el as del líder sale de la escalera natural formada por los 24 aces originales",
          "ordenados por nivel. Los equipos **draft** son mecánicos y **no están revisados**: no incluyen movimientos,",
          "objetos ni estrategia. Supuestos propios: formas no-nivel retroceden bajo el nivel "
          f"{NON_LEVEL_EVO_FLOOR}; los miembros añadidos van {abs(ADDED_LEVEL_OFFSET)} niveles bajo el as.", "",
          "## Escalera y etapas", "",
          "| Etapa | Medallas | As (de la escalera real) | As medio | Pokémon medidos (mín–máx) | Tamaño usado |",
          "|--:|---|---|--:|---|--:|"]
    for st in stage_info:
        md.append(f"| {st['stage']} | {st['medals'][0]}–{st['medals'][1]} | {st['aceBand'][0]}–{st['aceBand'][1]} | "
                  f"{st['aceMid']} | {st['partySizeMeasured']['min']}–{st['partySizeMeasured']['max']} | {st['partySize']} |")
    md += ["", "Escalera completa (nivel del as con N medallas previas, N = 0…23): " + ", ".join(map(str, A)), ""]

    real = sum(1 for l in leaders for s in l["stages"] if s["kind"] == "real")
    total = sum(len(l["stages"]) for l in leaders)
    flagged = [f"{l['name']} (etapa {s['stage']})" for l in leaders for s in l["stages"] if s.get("flags")]
    md += ["## Cobertura", "",
           f"De {total} configuraciones (24 líderes × 4 etapas): **{real} con un equipo real** de alguna fuente y "
           f"**{total - real} draft**. Con miembros que faltan: {len(flagged)}.", "",
           "| Líder | Región | Equipos reales disponibles | E1 | E2 | E3 | E4 |", "|---|---|--:|---|---|---|---|"]
    for l in leaders:
        cells = [f"{'R' if s['kind'] == 'real' else 'D'} {s['ace']}/{len(s['party'])}" for s in l["stages"]]
        md.append(f"| {l['name']} | {l['region']} | {l['teamsAvailable']} | " + " | ".join(cells) + " |")
    dup = [f"{l['name']} E{s['stage']}" for l in leaders for s in l["stages"]
           if s["kind"] == "draft" and len({m["species"] for m in s["party"]}) < len(s["party"])]
    md += ["", "R = equipo real; D = draft; formato «nivel del as / Pokémon».", "",
           f"Drafts con una especie repetida: {len(dup)} (parte viene del equipo original, p. ej. los dos Geodude de "
           "Roxanne; otros salen de reajustar la evolución y deben revisarse a mano): " + ", ".join(dup), ""]
    if flagged:
        md += ["Con huecos: " + ", ".join(flagged), ""]

    for who in ("BROCK", "FALKNER", "ROXANNE"):
        l = next(x for x in leaders if x["name"] == who)
        md += [f"## Ejemplo: {who}", ""]
        for s in l["stages"]:
            md.append(f"**Etapa {s['stage']}** — {'real' if s['kind'] == 'real' else 'draft'} "
                      f"(base `{s['from']['const']}` de {s['from']['source']}"
                      f"{', desplazado ' + format(s['from']['levelDelta'], '+d') if s['kind'] == 'draft' else ''})")
            md.append("")
            md += ["| Pokémon | Nivel | Notas |", "|---|--:|---|"]
            for m in s["party"]:
                notes = "; ".join(m.get("notes", []))
                md.append(f"| {short(m['species'])} | {m['level']} | {notes} |")
            md.append("")
    (OUT / "STAGES.md").write_text("\n".join(md) + "\n")
    print(f"ladder={A}")
    print(f"configs={total} real={real} draft={total - real} gaps={len(flagged)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
