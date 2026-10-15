#!/usr/bin/env python3
"""Generate the Fairy-type data used by the "unified" battle rules profile (Gen 6 additions).

Inputs (all already extracted):
  refs/showdown/gen_changes.json   Showdown's per-generation changes from the Gen 3 baseline (types, species, moves)
  public/fr/data/moves.json        FireRed's type chart (flat triples; the faithful baseline)
  public/fr/data/species.json      FireRed's species types
  public/fr/constants.json         ids of types, species and moves; charmap for the type name

What it produces: src/core/battle/data/fairyGen6.ts with
  - the Fairy type id and its encoded name,
  - the 18 Gen 1-3 species whose types change in Gen 6 and the 3 moves that become Fairy,
  - the type-chart edits: rows to remove (Steel stops resisting Ghost and Dark) and rows to add (Fairy).

Validation (the script fails otherwise): the FireRed chart for the 17 original types must equal Showdown's Gen 6 chart
once exactly the two Steel rows are removed, and the original types of every retyped species and move must match
Showdown's baseline. Nothing is edited by hand; regenerate with
    python3 tools/rules/fairy_overlay.py [--check]
"""
from __future__ import annotations

import base64
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "src" / "core" / "battle" / "data" / "fairyGen6.ts"
FAIRY_ID = 18  # after TYPE_DARK = 17; HnS uses the same id
MULT = {0: 10, 1: 20, 2: 5, 3: 0}  # Showdown damageTaken code -> FireRed multiplier
NAMES = {"Normal": 0, "Fighting": 1, "Flying": 2, "Poison": 3, "Ground": 4, "Rock": 5, "Bug": 6, "Ghost": 7, "Steel": 8,
         "Fire": 10, "Water": 11, "Grass": 12, "Electric": 13, "Psychic": 14, "Ice": 15, "Dragon": 16, "Dark": 17,
         "Fairy": FAIRY_ID}
REAL = [t for t in NAMES if t != "Fairy"]


def norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", s.lower())


def build() -> tuple[str, dict]:
    sd = json.loads((ROOT / "refs/showdown/gen_changes.json").read_text())
    sd = sd.get("data", sd)
    meta_src = json.loads((ROOT / "refs/showdown/gen_changes.json").read_text())["_meta"]
    consts = json.loads((ROOT / "public/fr/constants.json").read_text())
    movesraw = json.loads((ROOT / "public/fr/data/moves.json").read_text())
    species = json.loads((ROOT / "public/fr/data/species.json").read_text())["species"]
    charmap = json.loads((ROOT / "public/fr/charmap.json").read_text())["chars"]

    # --- FireRed chart -> {(atk, def): mult}, split at the Foresight marker
    flat = movesraw["typeEffectiveness"]
    fr_chart: dict[tuple[int, int], int] = {}
    fr_after_foresight: dict[tuple[int, int], int] = {}
    after = False
    for i in range(0, len(flat), 3):
        a, d, m = flat[i:i + 3]
        if a == 0xFF:
            break
        if a == 0xFE:
            after = True
            continue
        (fr_after_foresight if after else fr_chart)[(a, d)] = m

    # --- Showdown Gen 6 chart over the 17 original types
    types = sd["types"]
    def sd_mult(atk: str, dfn: str) -> int:
        rec = types[dfn.lower()]
        code = rec["changes"].get("gen6", {}).get(atk, rec["gen3"].get(atk))
        return MULT[code]
    sd_chart = {(NAMES[a], NAMES[d]): sd_mult(a, d) for a in REAL for d in REAL}
    fr_full = {**fr_chart, **fr_after_foresight}
    removed, other = [], []
    for k, v in sorted(sd_chart.items()):
        fr_v = fr_full.get(k, 10)
        if fr_v != v:
            (removed if (k[1] == 8 and k[0] in (7, 17) and fr_v == 5 and v == 10) else other).append((k, fr_v, v))
    if other or len(removed) != 2:
        raise SystemExit(f"FireRed chart and Showdown Gen 6 chart differ beyond the two Steel rows: {other} / {removed}")
    remove = [list(k) for k, _, _ in removed]

    # --- Fairy rows
    add = []
    for d in REAL:  # Fairy attacking
        rec = types[d.lower()]
        code = rec["changes"].get("gen6", {}).get("Fairy", rec["gen3"].get("Fairy"))
        if MULT[code] != 10:
            add.append([FAIRY_ID, NAMES[d], MULT[code]])
    for a in REAL:  # Fairy defending
        code = types["fairy"]["gen3"][a]
        if MULT[code] != 10:
            add.append([NAMES[a], FAIRY_ID, MULT[code]])
    if len(add) != 12:
        raise SystemExit(f"expected 12 Fairy rows, got {len(add)}")

    # --- Species
    fr_species = {}
    for k, v in consts.items():
        if k.startswith("SPECIES_") and isinstance(v, int) and 0 < v < len(species) and not k.startswith("SPECIES_OLD_"):
            fr_species.setdefault(norm(k[8:]), v)
    sp_changes = {}
    for key, rec in sd["species"].items():
        new = rec["changes"].get("gen6", {}).get("types")
        if not new:
            continue
        sid = fr_species.get(norm(key))
        if sid is None:
            raise SystemExit(f"species {key} has no FireRed id")
        old = [NAMES[t] for t in rec["gen3"]["types"]]
        fr_old = species[sid]["types"]
        if sorted(set(fr_old)) != sorted(set(old)):
            raise SystemExit(f"{key}: FireRed types {fr_old} differ from Showdown baseline {old}")
        t = [NAMES[x] for x in new]
        sp_changes[sid] = [t[0], t[1] if len(t) > 1 else t[0]]
    if len(sp_changes) != 18:
        raise SystemExit(f"expected 18 retyped species, got {len(sp_changes)}")

    # --- Moves
    fr_moves = {}
    for k, v in consts.items():
        if k.startswith("MOVE_") and isinstance(v, int) and 0 < v < 355 and not k.startswith(("MOVE_EFFECT_", "MOVE_RESULT_", "MOVE_TARGET_")):
            fr_moves.setdefault(norm(k[5:]), v)
    mv_changes = {}
    for key, rec in sd["moves"].items():
        new = rec["changes"].get("gen6", {}).get("type")
        if not new:
            continue
        mid = fr_moves.get(norm(key))
        if mid is None:
            raise SystemExit(f"move {key} has no FireRed id")
        if movesraw["moves"][mid]["type"] != NAMES[rec["gen3"]["type"]]:
            raise SystemExit(f"{key}: FireRed type differs from Showdown baseline")
        mv_changes[mid] = NAMES[new]

    # --- Name, encoded with the game's charmap and terminated like the other type names
    name_bytes = [charmap[c] for c in "FAIRY"] + [0xFF]
    name_b64 = base64.b64encode(bytes(name_bytes)).decode()
    existing = [base64.b64decode(n)[-1] for n in movesraw["types"]]
    assert all(b == 0xFF for b in existing), "type names no longer end in 0xFF"

    def lit(d):
        return "{ " + ", ".join(f"{k}: {json.dumps(v)}" for k, v in sorted(d.items())) + " }"

    src = (
        "// GENERATED by tools/rules/fairy_overlay.py -- do not edit; regenerate with that script.\n"
        f"// Source: Pokémon Showdown {meta_src['commit'][:10]} (Gen 6 changes over the Gen 3 baseline) validated against\n"
        "// FireRed's own type chart, species and move tables (see the script header for the checks).\n"
        "// Applied only by the \"unified\" battle rules profile (src/core/battle/rules.ts).\n"
        f"export const TYPE_FAIRY = {FAIRY_ID};\n"
        f"/** \"FAIRY\" in the game's character encoding, base64, 0xFF-terminated like the other type names. */\n"
        f"export const FAIRY_TYPE_NAME_B64 = \"{name_b64}\";\n"
        "/** Species id -> [type1, type2] (single-type species repeat the type, as the game does). */\n"
        f"export const FAIRY_SPECIES_TYPES: Record<number, [number, number]> = {lit({k: v for k, v in sp_changes.items()})};\n"
        "/** Move id -> new type. */\n"
        f"export const FAIRY_MOVE_TYPES: Record<number, number> = {lit(mv_changes)};\n"
        "/** [attack type, defend type] rows of the Gen 3 chart that Gen 6 removes (Steel stops resisting Ghost and Dark). */\n"
        f"export const TYPE_CHART_REMOVE: ReadonlyArray<readonly [number, number]> = {json.dumps(remove)};\n"
        "/** [attack type, defend type, multiplier x10] rows Gen 6 adds for Fairy. */\n"
        f"export const TYPE_CHART_ADD: ReadonlyArray<readonly [number, number, number]> = {json.dumps(add)};\n"
    )
    meta = {"species": len(sp_changes), "moves": len(mv_changes), "remove": len(remove), "add": len(add), "name": name_b64}
    return src, meta


def main() -> int:
    src, meta = build()
    if "--check" in sys.argv:
        if not OUT.exists() or OUT.read_text() != src:
            print("fairyGen6.ts is stale or missing; run tools/rules/fairy_overlay.py")
            return 1
        print(f"fairyGen6.ts up to date ({meta})")
        return 0
    OUT.write_text(src)
    print(f"{OUT.relative_to(ROOT)}: {meta}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
