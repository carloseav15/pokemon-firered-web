#!/usr/bin/env python3
"""Per-generation rule changes from Pokémon Showdown, from the Gen 3 baseline.

Showdown models each generation as a mod that inherits from the next one
(gen3frlg -> gen3 -> gen4 -> ... -> gen9). tools/refs/showdown_dump.cjs resolves
every move, ability, item, species and type chart in gen3..gen9 through
Showdown's own Dex; this script keeps what existed in Gen 3 and records only the
fields that change in each later generation.

Outputs:
  refs/showdown/gen_changes.json
    moves / abilities / items / species: {id: {"gen3": record, "changes": {"gen5": {field: value}}}}
      for entries introduced in Gen 1-3. Handlers ("onModifyDamage", "condition.onStart"...)
      are short hashes of their source: a changed hash means changed behaviour.
    types: {type: {"gen3": damageTaken, "changes": {...}}} (0 neutral, 1 weak, 2 resist, 3 immune)
    added: {"moves"|"abilities"|"items"|"species": {"gen4": [ids], ...}}
  refs/showdown/gen3_vs_firered.json
    Showdown's gen3 values against the FireRed export (public/fr/data): moves (type,
    power, accuracy, PP, priority, effect chance) and species 1-386 (base stats, types,
    abilities). The decomp is the source of truth: a difference is Showdown's or a
    representation choice, never a correction for FireRed.
Showdown does not reproduce the GBA RNG or call order; use it for rules, not for
frame-exact behaviour.

Usage: npm run refs:showdown-gens
  The checkout must be built once (outside the repo):
  cd ../refs-src/pokemon-showdown && npm install --omit=dev --ignore-scripts && node build
"""

from __future__ import annotations

import json
import re
import subprocess

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import portInventory as P  # noqa: E402  (pokefirered location)
from common import ROOT, source_path, write_output  # noqa: E402

GENS = [f"gen{g}" for g in range(3, 10)]
FIRERED_TYPES = ["Normal", "Fighting", "Flying", "Poison", "Ground", "Rock", "Bug", "Ghost", "Steel",
                 "???", "Fire", "Water", "Grass", "Electric", "Psychic", "Ice", "Dragon", "Dark"]
STATS = ["hp", "atk", "def", "spe", "spa", "spd"]  # FireRed BaseStats order


def ident(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", name.lower())


def changes(per_gen: dict) -> dict:
    base = per_gen["gen3"]
    out, prev = {}, base
    for gen in GENS[1:]:
        cur = per_gen.get(gen)
        if cur is None:
            out[gen] = {"removed": True}
            continue
        diff = {k: v for k, v in cur.items() if prev.get(k) != v and k != "handlers"}
        handlers = {k: v for k, v in cur.get("handlers", {}).items() if prev.get("handlers", {}).get(k) != v}
        gone = sorted(set(prev.get("handlers", {})) - set(cur.get("handlers", {})))
        if handlers or gone:
            diff["handlers"] = {**handlers, **{k: None for k in gone}}
        if diff:
            out[gen] = diff
        prev = cur
    return out


def compare_firered(sd: dict) -> dict:
    data = ROOT / "public/fr/data"
    fr_moves = json.loads((data / "moves.json").read_text())["moves"]
    fr_species = json.loads((data / "species.json").read_text())["species"]
    moves_by_num = {r["gen3"]["num"]: (k, r["gen3"]) for k, r in sd["moves"].items() if "gen3" in r}
    # FireRed ability ids are the decomp's ABILITY_* values (Cacophony is 76, Air Lock 77),
    # not Showdown's nums: map them by name.
    header = (P.DECOMP / "include/constants/abilities.h").read_text()
    ability_by_num = {int(v): ident(n) for n, v in re.findall(r"#define ABILITY_(\w+)\s+(\d+)", header)}
    species_by_num = {r["gen3"]["num"]: (k, r["gen3"]) for k, r in sd["species"].items() if "gen3" in r}

    moves = {}
    for num in range(1, len(fr_moves)):
        fr = fr_moves[num]
        if num not in moves_by_num:
            raise SystemExit(f"Showdown gen3 has no move num {num}")
        key, s = moves_by_num[num]
        chances = [x.get("chance", 100) for x in (s["secondaries"] or [])]
        pairs = {
            "type": (FIRERED_TYPES[fr["type"]], s["type"]),
            "power": (fr["power"], s["basePower"]),
            "accuracy": (fr["accuracy"], 0 if s["accuracy"] == "always" else s["accuracy"]),
            "pp": (fr["pp"], s["pp"]),
            "priority": (fr["priority"], s["priority"]),
        }
        if fr["chance"]:
            pairs["effect_chance"] = (fr["chance"], max(chances) if chances else None)
        diff = {}
        for field, (a, b) in pairs.items():
            if a == b:
                continue
            kind = "real"
            if field == "power" and b == 0 and (a == 1 or "basePowerCallback" in s["handlers"]):
                kind = "representation"  # variable damage: FireRed stores 1 (or a nominal power)
            elif field == "accuracy" and s["accuracy"] == "always":
                kind = "representation"  # Showdown: the move never runs an accuracy check
            elif field == "effect_chance" and b is None:
                kind = "representation"  # Showdown implements the effect outside `secondaries`
            elif key == "hiddenpower":
                kind = "representation"  # power and type are computed from IVs in both
            diff[field] = {"firered": a, "showdown": b, "kind": kind}
        if diff:
            moves[key] = diff

    species = {}
    for entry in fr_species:
        nat = entry.get("national", 0)
        if not 1 <= nat <= 386:
            continue
        if nat not in species_by_num:
            raise SystemExit(f"Showdown gen3 has no species num {nat}")
        key, s = species_by_num[nat]
        fr_types = sorted({FIRERED_TYPES[t] for t in entry["types"]})
        fr_abil = sorted({ability_by_num[a] for a in entry["abilities"] if a})
        sd_abil = sorted({ident(v) for k, v in s["abilities"].items() if k in ("0", "1")})
        pairs = {
            "baseStats": (dict(zip(STATS, entry["base"])), {k: s["baseStats"][k] for k in STATS}),
            "types": (fr_types, sorted(set(s["types"]))),
            "abilities": (fr_abil, sd_abil),
        }
        diff = {f: {"firered": a, "showdown": b} for f, (a, b) in pairs.items() if a != b}
        if diff:
            species[key] = diff
    return {"moves": moves, "species": species}


def main() -> None:
    checkout = source_path("pokemon-showdown")
    if not (checkout / "dist/sim/dex.js").exists():
        raise SystemExit(f"{checkout}/dist missing: run `npm install --omit=dev --ignore-scripts && node build` there")
    raw = subprocess.run(["node", str(ROOT / "tools/refs/showdown_dump.cjs"), str(checkout)],
                         capture_output=True, text=True, check=True).stdout
    sd = json.loads(raw)

    out: dict = {"added": {}}
    for table in ("moves", "abilities", "items", "species"):
        kept, added = {}, {}
        for key, per_gen in sorted(sd[table].items()):
            first = next(iter(per_gen.values()))
            intro = first["gen"]
            if intro <= 3 and "gen3" in per_gen and first["num"] > 0:
                kept[key] = {"gen3": per_gen["gen3"], "changes": changes(per_gen)}
            elif intro > 3:
                added.setdefault(f"gen{intro}", []).append(key)
        out[table] = kept
        out["added"][table] = {g: sorted(v) for g, v in sorted(added.items())}
    out["types"] = {k: {"gen3": v["gen3"], "changes": changes(v)}
                    for k, v in sorted(sd["types"].items()) if "gen3" in v}
    total = sum(len(out[t]) for t in ("moves", "abilities", "items", "species", "types"))
    write_output("showdown", "gen_changes.json", out, "pokemon-showdown",
                 "tools/refs/showdown_gens.py", entries=total)

    check = compare_firered(sd)
    write_output("showdown", "gen3_vs_firered.json", check, "pokemon-showdown",
                 "tools/refs/showdown_gens.py", entries=len(check["moves"]) + len(check["species"]))


if __name__ == "__main__":
    main()
