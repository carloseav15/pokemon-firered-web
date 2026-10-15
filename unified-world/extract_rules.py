#!/usr/bin/env python3
"""Combat rules matrix and impact of the planned rule changes (docs/MUNDO-UNIFICADO.md, section 2).

Three outputs, each with its evidence:
  1. Rules matrix: mechanic by generation (3, 4, 5, 6), read from Pokémon Showdown's per-generation mods
     (the pinned checkout in ../refs-src/pokemon-showdown) and, for weather, from the FireRed decomp.
     Every row cites `file:line`, found by searching an anchor so a moved line is caught, not hidden.
  2. Impact of the per-move physical/special split on Gen 1-3 moves and on species.
  3. Impact of the Fairy type (retyped species and moves, type-chart changes) and the move/ability/item
     catalogue added by Gen 4-6.

Showdown does not reproduce the GBA RNG or call order: it is evidence for *rules*, not frame-exact behaviour.
The "propuesta" column is mine and is not a decision.

Usage: python3 unified-world/extract_rules.py
Output: unified-world/out/RULES.md and unified-world/out/rules.json
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "unified-world" / "out"
SD = ROOT.parent / "refs-src" / "pokemon-showdown"
FR = ROOT / "pokefirered"

# --- evidence ------------------------------------------------------------------------------------------------

def find(path: Path, pattern: str, rel: Path) -> str:
    rx = re.compile(pattern)
    for n, line in enumerate(path.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
        if rx.search(line):
            return f"{path.relative_to(rel)}:{n}"
    raise SystemExit(f"evidence anchor not found: {path} /{pattern}/")


def sd(path: str, pattern: str) -> str:
    return "showdown/" + find(SD / path, pattern, SD)


def fr(path: str, pattern: str) -> str:
    return "pokefirered/" + find(FR / path, pattern, FR)


def rows() -> list[dict]:
    m = "data/mods"
    return [
        {"rule": "Categoría físico/especial", "g3": "por tipo (Fuego, Agua, Planta, Hielo, Eléctrico, Siniestro, Psíquico y Dragón = especial)",
         "g4": "por movimiento", "g5": "por movimiento", "g6": "por movimiento", "propuesta": "por movimiento (Gen 4)",
         "evidence": [sd(f"{m}/gen3/scripts.ts", r"specialTypes = ")]},
        {"rule": "Probabilidad de crítico por etapa", "g3": "1/16, 1/8, 1/4, 1/3, 1/2", "g4": "igual", "g5": "igual",
         "g6": "1/16, 1/8, 1/2, 1/1", "propuesta": "la de Gen 3 (fiel)",
         "evidence": [sd("sim/battle-actions.ts", r"critMult = \[0, 16, 8, 4, 3, 2\]"),
                      sd("sim/battle-actions.ts", r"critMult = \[0, 16, 8, 2, 1\]")]},
        {"rule": "Multiplicador de crítico", "g3": "×2", "g4": "×2", "g5": "×2", "g6": "×1,5", "propuesta": "×2 (fiel)",
         "evidence": [sd("sim/battle-actions.ts", r"gen >= 6 \? 1\.5 : 2")]},
        {"rule": "Modificador de golpe múltiple en dobles", "g3": "×0,5", "g4": "×0,75", "g5": "×0,75", "g6": "×0,75",
         "propuesta": "pendiente (afecta solo a dobles)",
         "evidence": [sd(f"{m}/gen3/scripts.ts", r"spreadModifier = 0\.5"), sd(f"{m}/gen4/scripts.ts", r"move\.spreadModifier \|\|")]},
        {"rule": "Quemadura: daño residual", "g3": "1/8 de PS", "g4": "1/8", "g5": "1/8", "g6": "1/8 (1/16 desde Gen 7)",
         "propuesta": "1/8 (fiel)",
         "evidence": [sd(f"{m}/gen6/conditions.ts", r"baseMaxhp / 8"), sd("data/conditions.ts", r"baseMaxhp / 16")]},
        {"rule": "Quemadura: reducción de daño físico", "g3": "×0,5 salvo Agallas", "g4": "igual", "g5": "igual", "g6": "igual",
         "propuesta": "×0,5 (fiel)", "evidence": [sd(f"{m}/gen3/scripts.ts", r"pokemon\.status === 'brn'")]},
        {"rule": "Parálisis: velocidad", "g3": "×0,25", "g4": "×0,25", "g5": "×0,25", "g6": "×0,25 (×0,5 desde Gen 7)",
         "propuesta": "×0,25 (fiel)",
         "evidence": [sd(f"{m}/gen4/conditions.ts", r"chainModify\(0\.25\)"), sd(f"{m}/gen6/conditions.ts", r"25 / 100")]},
        {"rule": "Sueño: duración", "g3": "1–4 turnos; el contador se conserva al cambiar (Sleep Talk y Ronquido no cuentan)",
         "g4": "1–4 turnos", "g5": "1–3 turnos; el contador se reinicia al cambiar", "g6": "1–3 turnos",
         "propuesta": "Gen 3 (fiel)",
         "evidence": [sd(f"{m}/gen3/conditions.ts", r"random\(2, 6\)"), sd("data/conditions.ts", r"startTime = this\.random\(2, 5\)"),
                      sd(f"{m}/gen5/conditions.ts", r"onSwitchIn")]},
        {"rule": "Congelación", "g3": "1/5 de descongelar por turno; un golpe de Fuego descongela (Hidden Power y Weather Ball no cuentan)",
         "g4": "1/5 por turno; golpe de Fuego descongela", "g5": "igual", "g6": "igual",
         "propuesta": "pendiente (Frostbite por evaluar)",
         "evidence": [sd(f"{m}/gen3/conditions.ts", r"type === 'Fire'"), sd(f"{m}/gen4/conditions.ts", r"randomChance\(1, 5\)")]},
        {"rule": "Movimientos de atadura (Wrap, Bind…)", "g3": "3–6 turnos del simulador; daño 1/16 por turno",
         "g4": "3–6; Garra Garra fija la duración en 6", "g5": "5–6; daño 1/16 (1/8 con Banda Atadura)",
         "g6": "5–6; daño 1/8 (1/6 con Banda Atadura)", "propuesta": "Gen 3 (fiel)",
         "evidence": [sd(f"{m}/gen4/conditions.ts", r"random\(3, 7\)"),
                      sd(f"{m}/gen5/conditions.ts", r"boundDivisor = source\.hasItem\('bindingband'\) \? 8 : 16"),
                      sd("data/conditions.ts", r"bindingband'\) \? 6 : 8")]},
        {"rule": "Protección encadenada (Protect, Detect, Endure)", "g3": "la probabilidad se divide a la mitad hasta 1/8",
         "g4": "igual", "g5": "se divide a la mitad hasta 1/256", "g6": "se divide entre 3 hasta 1/729",
         "propuesta": "Gen 3 (fiel)",
         "evidence": [sd(f"{m}/gen4/conditions.ts", r"counterMax: 8"), sd(f"{m}/gen5/conditions.ts", r"counterMax: 256"),
                      sd("data/conditions.ts", r"counterMax: 729")]},
        {"rule": "Tormenta de arena", "g3": "no sube la Def. Esp. de tipo Roca", "g4": "sube ×1,5 a tipo Roca", "g5": "igual",
         "g6": "igual", "propuesta": "pendiente",
         "evidence": [sd(f"{m}/gen3/conditions.ts", r"onModifySpD: undefined")]},
        {"rule": "Clima fijado por habilidad (Llovizna, Sequía…)", "g3": "permanente mientras no cambie el clima",
         "g4": "no verificado en Showdown", "g5": "no verificado", "g6": "no verificado",
         "propuesta": "pendiente: el decomp de FireRed es la referencia fiel",
         "evidence": [fr("src/battle_util.c", r"B_WEATHER_RAIN_TEMPORARY \| B_WEATHER_RAIN_PERMANENT")]},
        {"rule": "Tabla de tipos", "g3": "18 tipos; Acero resiste Siniestro y Fantasma", "g4": "igual", "g5": "igual",
         "g6": "añade Hada; Acero deja de resistir Siniestro y Fantasma", "propuesta": "Gen 6",
         "evidence": [sd(f"{m}/gen6/typechart.ts", r"damageTaken")]},
    ]


# --- analysis ------------------------------------------------------------------------------------------------

PHYSICAL_TYPES = {"NORMAL", "FIGHTING", "FLYING", "POISON", "GROUND", "ROCK", "BUG", "GHOST", "STEEL", "MYSTERY"}


HIDDEN_POWER = 237  # type (and so category) depends on the Pokémon's IVs: not a fixed move
NAME_ALIASES = {"faintattack": "feintattack"}  # Platinum's (Gen 4) name vs Showdown's id


def norm(s: str) -> str:
    n = re.sub(r"[^a-z0-9]", "", s.lower())
    return NAME_ALIASES.get(n, n)


def load():
    consts = json.loads((ROOT / "public/fr/constants.json").read_text())
    moves = json.loads((ROOT / "public/fr/data/moves.json").read_text())["moves"]
    species = json.loads((ROOT / "public/fr/data/species.json").read_text())["species"]
    plat = {m["id"]: m for m in json.loads((ROOT / "refs/platinum/moves.json").read_text())["data"]}
    chg = json.loads((ROOT / "refs/showdown/gen_changes.json").read_text())
    return consts, moves, species, plat, chg.get("data", chg)


def analyse_split(consts, moves, species, plat, chg):
    type_by_id = {v: k[5:] for k, v in consts.items() if k.startswith("TYPE_") and isinstance(v, int) and v <= 17}
    changed: dict[int, dict] = {}
    damaging = 0
    for mid in range(1, 355):
        fm, pm = moves[mid], plat.get(mid)
        if mid == HIDDEN_POWER or not pm or fm["power"] <= 0 or pm["class"] not in ("CLASS_PHYSICAL", "CLASS_SPECIAL"):
            continue
        damaging += 1
        old = "PHYSICAL" if type_by_id.get(fm["type"]) in PHYSICAL_TYPES else "SPECIAL"
        new = pm["class"][6:]
        if old != new:
            changed[mid] = {"id": mid, "name": pm["name"], "type": type_by_id.get(fm["type"]),
                            "old": old, "new": new, "power": fm["power"]}
    sd_changed = {norm(k) for k, v in chg["moves"].items() if "category" in v["changes"].get("gen4", {})}
    mine = {norm(c["name"]) for c in changed.values()}
    # species
    sp_names = {v: k for k, v in consts.items() if k.startswith("SPECIES_") and not k.startswith("SPECIES_OLD")}
    results = []
    for sid, rec in enumerate(species):
        name = sp_names.get(sid)
        if not name or sum(rec["base"]) == 0:
            continue
        base = dict(zip(("hp", "atk", "def", "spe", "spa", "spd"), rec["base"]))
        if base["atk"] == base["spa"]:
            continue
        prefer = "PHYSICAL" if base["atk"] > base["spa"] else "SPECIAL"
        own = {type_by_id.get(t) for t in rec["types"]}
        learn = {m for _, m in rec["learnset"]}
        best_old = best_new = 0
        for mid in learn:
            fm, pm = moves[mid] if mid < len(moves) else None, plat.get(mid)
            if not fm or not pm or fm["power"] <= 1 or type_by_id.get(fm["type"]) not in own:
                continue
            if pm["class"] not in ("CLASS_PHYSICAL", "CLASS_SPECIAL"):
                continue
            old = "PHYSICAL" if type_by_id.get(fm["type"]) in PHYSICAL_TYPES else "SPECIAL"
            if old == prefer:
                best_old = max(best_old, fm["power"])
            if pm["class"][6:] == prefer:
                best_new = max(best_new, fm["power"])
        results.append({"species": name[8:], "prefers": prefer, "atk": base["atk"], "spa": base["spa"],
                        "bestStabOld": best_old, "bestStabNew": best_new, "delta": best_new - best_old})
    return changed, damaging, results, sd_changed, mine


def analyse_fairy(chg):
    species_changes = []
    for k, v in chg["species"].items():
        c = v["changes"].get("gen6", {})
        if "types" in c:
            species_changes.append({"species": k, "gen3": v["gen3"].get("types"), "gen6": c["types"]})
    move_changes = [{"move": k, "to": v["changes"]["gen6"]["type"], "from": v["gen3"].get("type")}
                    for k, v in chg["moves"].items() if "type" in v["changes"].get("gen6", {})]
    types = chg["types"]
    fairy_out: dict[str, int | None] = {}
    for t, rec in types.items():
        if t in ("stellar", "fairy"):
            continue
        ch = rec["changes"].get("gen6", {})
        fairy_out[t] = ch["Fairy"] if "Fairy" in ch else rec["gen3"].get("Fairy")
    fairy_in = {k: v for k, v in types["fairy"]["gen3"].items() if k not in ("Stellar", "Fairy")}
    steel = {atk: [rec_old, new] for atk, new in types["steel"]["changes"].get("gen6", {}).items()
             if (rec_old := types["steel"]["gen3"].get(atk)) is not None and atk in ("Dark", "Ghost")}
    return species_changes, move_changes, fairy_out, fairy_in, steel


LAB = {0: "neutro", 1: "superefectivo", 2: "resistido", 3: "inmune"}


def main() -> int:
    consts, moves, species, plat, chg = load()
    changed, damaging, sp_results, sd_changed, mine = analyse_split(consts, moves, species, plat, chg)
    sp_chg, mv_chg, fairy_out, fairy_in, steel = analyse_fairy(chg)
    matrix = rows()
    added = {k: {g: len(v) for g, v in vv.items()} for k, vv in chg["added"].items()}

    by_gen = {}
    for kind in ("moves", "abilities", "items", "species"):
        c: dict[str, int] = {}
        for rec in chg[kind].values():
            for gen in rec["changes"]:
                c[gen] = c.get(gen, 0) + 1
        by_gen[kind] = dict(sorted(c.items()))

    ranked = sorted(sp_results, key=lambda r: (-r["delta"], r["species"]))
    winners, losers = ranked[:12], sorted(sp_results, key=lambda r: (r["delta"], r["species"]))[:12]
    summary = {"better": sum(1 for r in sp_results if r["delta"] > 0), "worse": sum(1 for r in sp_results if r["delta"] < 0),
               "same": sum(1 for r in sp_results if r["delta"] == 0), "evaluated": len(sp_results)}

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "rules.json").write_text(json.dumps({
        "_meta": {"generator": "unified-world/extract_rules.py", "showdown": "pinned in refs/showdown/gen_changes.json",
                  "note": "propuesta column is not a decision"},
        "matrix": matrix,
        "split": {"damagingGen1to3": damaging, "categoryChanges": sorted(changed.values(), key=lambda c: c["id"]),
                  "showdownCount": len(sd_changed), "onlyInPlatinum": sorted(mine - sd_changed),
                  "onlyInShowdown": sorted(sd_changed - mine), "speciesSummary": summary, "species": sp_results},
        "fairy": {"speciesRetyped": sp_chg, "movesRetyped": mv_chg, "fairyAttacking": fairy_out, "fairyDefending": fairy_in,
                  "steelLoses": steel},
        "catalogAddedByGen": added, "changesByGen": by_gen}, indent=1, sort_keys=True) + "\n")

    md = ["# Reglas de combate: matriz e impacto (generado)", "",
          "Generado por `unified-world/extract_rules.py`; no editar a mano. Evidencia en el simulador de Showdown (checkout",
          "fijado) y, para el clima, en el decomp de FireRed. Showdown no reproduce el RNG ni el orden de llamadas de la",
          "GBA: es evidencia de **reglas**, no de comportamiento exacto. La columna *propuesta* es mía, no una decisión.", "",
          "## 1. Matriz de reglas", "",
          "| Regla | Gen 3 | Gen 4 | Gen 5 | Gen 6 | Propuesta | Evidencia |", "|---|---|---|---|---|---|---|"]
    for r in matrix:
        md.append(f"| {r['rule']} | {r['g3']} | {r['g4']} | {r['g5']} | {r['g6']} | {r['propuesta']} | "
                  + "<br>".join(f"`{e}`" for e in r["evidence"]) + " |")
    md += ["", "Filas **no** cubiertas aquí por no haberse leído (siguen abiertas): orden de acción y empates de velocidad,",
           "precisión y evasión, retroceso, `Counter`/`Mirror Coat`, objetos retenidos, habilidades concretas.", "",
           "## 2. Impacto del split físico/especial", "",
           f"De **{damaging}** movimientos de daño de las generaciones 1–3 de tipo fijo (según FireRed y Platinum; "
           "Hidden Power queda fuera porque su tipo depende de los IV), "
           f"**{len(changed)}** cambian de categoría respecto al reparto por tipo.",
           f"Showdown cuenta {len(sd_changed)} cambios de categoría en Gen 4; difieren en "
           f"{len(mine - sd_changed) + len(sd_changed - mine)} (solo en Platinum: {', '.join(sorted(mine - sd_changed)) or '–'}; "
           f"solo en Showdown: {', '.join(sorted(sd_changed - mine)) or '–'}).", "",
           "| Movimiento | Tipo | Antes | Después | Potencia |", "|---|---|---|---|--:|"]
    for c in sorted(changed.values(), key=lambda c: (c["old"], c["name"])):
        md.append(f"| {c['name']} | {c['type'].title()} | {c['old'].lower()} | "
                  f"{c['new'].lower()} | {c['power']} |")
    md += ["", f"### Efecto sobre especies ({summary['evaluated']} con Ataque ≠ Ataque Esp.)", "",
           f"Mejor movimiento STAB de aprendizaje por nivel que usa su estadística ofensiva alta: **{summary['better']} "
           f"especies mejoran**, {summary['worse']} empeoran y {summary['same']} quedan igual.", "",
           "Solo movimientos aprendidos por nivel; no cuenta MT/MO, tutores ni movimientos de huevo, ni precisión o efectos.", "",
           "| Gana más | Prefiere | Mejor STAB antes → después |", "|---|---|---|"]
    for r in winners:
        md.append(f"| {r['species'].title()} | {r['prefers'].lower()} | {r['bestStabOld']} → {r['bestStabNew']} |")
    md += ["", "| Pierde más | Prefiere | Mejor STAB antes → después |", "|---|---|---|"]
    for r in losers:
        md.append(f"| {r['species'].title()} | {r['prefers'].lower()} | {r['bestStabOld']} → {r['bestStabNew']} |")

    md += ["", "## 3. Impacto de Fairy", "",
           f"- Especies que cambian de tipo en Gen 6 (datos de Showdown): **{len(sp_chg)}** de las 386 de Gen 1–3.",
           f"- Movimientos que cambian de tipo en Gen 6: **{len(mv_chg)}**.", "",
           "| Especie | Antes | Después |", "|---|---|---|"]
    for s in sp_chg:
        md.append(f"| {s['species']} | {'/'.join(s['gen3'] or [])} | {'/'.join(s['gen6'])} |")
    md += ["", "| Movimiento | Antes | Después |", "|---|---|---|"]
    for m_ in mv_chg:
        md.append(f"| {m_['move']} | {m_['from']} | {m_['to']} |")
    sup = ", ".join(t.title() for t, v in fairy_out.items() if v == 1)
    res = ", ".join(t.title() for t, v in fairy_out.items() if v == 2)
    imm = ", ".join(t.title() for t, v in fairy_out.items() if v == 3)
    md += ["", f"Hada **ataca**: superefectivo contra {sup or '–'}; resistido por {res or '–'}; inmune: {imm or '–'}.",
           "Hada **defiende**: débil a " + ", ".join(t for t, v in fairy_in.items() if v == 1)
           + "; resiste " + ", ".join(t for t, v in fairy_in.items() if v == 2)
           + "; inmune a " + (", ".join(t for t, v in fairy_in.items() if v == 3) or "–") + ".",
           "Acero deja de resistir " + " y ".join(f"{a}" for a in steel) + " en Gen 6.", "",
           "## 4. Catálogo y cambios por generación (Showdown, desde la base Gen 3)", "",
           "| Generación | Movimientos nuevos | Habilidades nuevas | Objetos nuevos | Especies nuevas |", "|---|--:|--:|--:|--:|"]
    for g in ("gen4", "gen5", "gen6"):
        md.append(f"| {g} | {added['moves'].get(g, 0)} | {added['abilities'].get(g, 0)} | "
                  f"{added['items'].get(g, 0)} | {added['species'].get(g, 0)} |")
    md += ["", "Cambios sobre lo que ya existía en Gen 3 (movimientos, habilidades y objetos con algún campo modificado):", "",
           "| Generación | Movimientos | Habilidades | Objetos | Especies |", "|---|--:|--:|--:|--:|"]
    for g in ("gen4", "gen5", "gen6"):
        md.append(f"| {g} | {by_gen['moves'].get(g, 0)} | {by_gen['abilities'].get(g, 0)} | "
                  f"{by_gen['items'].get(g, 0)} | {by_gen['species'].get(g, 0)} |")
    (OUT / "RULES.md").write_text("\n".join(md) + "\n")
    print(f"matrix={len(matrix)} damaging={damaging} split_changes={len(changed)} showdown={len(sd_changed)} "
          f"species={summary} fairy_species={len(sp_chg)} fairy_moves={len(mv_chg)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
