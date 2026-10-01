#!/usr/bin/env python3
"""Compare Platinum species data with FireRed for national numbers 1-386.

Output: refs/platinum/species_vs_firered.json, containing only species whose
base stats, types, abilities, egg groups, catch rate, or level-up learnset
differs. Platinum names and learnsets come from refs/platinum; FireRed data
comes from public/fr and is paired by its national field.

Usage: npm run refs:platinum-species-vs-firered
"""

from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path

from common import ROOT, write_output

NATIONAL_COUNT = 386
STAT_ORDER = ("hp", "attack", "defense", "speed", "special_attack", "special_defense")
FIELDS = ("stats", "types", "abilities", "egg_groups", "catch_rate", "learnset")
FIRERED_CONSTANTS = ROOT.parent / "pokefirered/include/constants"


def constants(path: Path, prefix: str) -> dict[str, int]:
    if not path.is_file():
        raise SystemExit(f"FireRed constants not found: {path}")
    pattern = re.compile(rf"^#define\s+({prefix}[A-Z0-9_]+)\s+(-?(?:0x[0-9A-Fa-f]+|\d+))\s*$", re.MULTILINE)
    return {name: int(value, 0) for name, value in pattern.findall(path.read_text())}


def require_mapped(value: str, table: dict[str, int], species: str, category: str) -> int:
    try:
        return table[value]
    except KeyError:
        raise SystemExit(f"{species}: unmapped {category} constant {value!r}") from None


def main() -> None:
    platinum = json.loads((ROOT / "refs/platinum/species.json").read_text())["data"]
    firered = json.loads((ROOT / "public/fr/data/species.json").read_text())["species"]
    moves = json.loads((ROOT / "refs/platinum/moves.json").read_text())["data"]
    if len(platinum) < NATIONAL_COUNT + 1:
        raise SystemExit(f"expected at least {NATIONAL_COUNT + 1} Platinum species, found {len(platinum)}")

    by_national = {}
    for internal_id, species in enumerate(firered):
        national = species.get("national")
        if national is not None and 1 <= national <= NATIONAL_COUNT:
            if national in by_national:
                raise SystemExit(f"duplicate FireRed national number {national}")
            by_national[national] = (internal_id, species)
    missing_national = sorted(set(range(1, NATIONAL_COUNT + 1)) - by_national.keys())
    if missing_national:
        raise SystemExit(f"FireRed data missing national numbers: {missing_national}")

    pokemon_constants = FIRERED_CONSTANTS / "pokemon.h"
    type_ids = constants(pokemon_constants, "TYPE_")
    egg_group_ids = constants(pokemon_constants, "EGG_GROUP_")
    ability_ids = constants(FIRERED_CONSTANTS / "abilities.h", "ABILITY_")
    move_ids = {move["const"]: move["id"] for move in moves}
    if len(move_ids) != len(moves):
        raise SystemExit("refs/platinum/moves.json: duplicate move constants")

    differences = []
    counts: Counter[str] = Counter()
    for national in range(1, NATIONAL_COUNT + 1):
        p = platinum[national]
        _, f = by_national[national]
        const = p["const"]
        if p.get("id") != national:
            raise SystemExit(f"Platinum index {national} contains id {p.get('id')!r}")
        p_abilities = []
        for ability in p["abilities"]:
            if ability in ability_ids:
                p_abilities.append(ability_ids[ability])
            else:
                # Gen 4 added abilities that have no FireRed numeric constant.
                p_abilities.append(ability)

        p_learnset = []
        for level, move in p["learnset"]["by_level"]:
            if move not in move_ids:
                raise SystemExit(f"{const}: level-up learnset has unknown move {move!r}")
            p_learnset.append([level, move_ids[move]])

        platinum_values = {
            "stats": [p["base_stats"][stat] for stat in STAT_ORDER],
            "types": [require_mapped(t, type_ids, const, "type") for t in p["types"]],
            "abilities": p_abilities,
            "egg_groups": [require_mapped(g, egg_group_ids, const, "egg group") for g in p["egg_groups"]],
            "catch_rate": p["catch_rate"],
            "learnset": p_learnset,
        }
        firered_values = {
            "stats": f["base"],
            "types": f["types"],
            "abilities": f["abilities"],
            "egg_groups": f["eggGroups"],
            "catch_rate": f["catchRate"],
            "learnset": f["learnset"],
        }
        changes = {}
        for field in FIELDS:
            if firered_values[field] != platinum_values[field]:
                changes[field] = [firered_values[field], platinum_values[field]]
                counts[field] += 1
        if changes:
            differences.append({"national": national, "const": const, "cambios": changes})

    write_output(
        "platinum",
        "species_vs_firered.json",
        differences,
        "pokeplatinum",
        "tools/refs/compare_platinum_species.py",
    )
    print(f"{len(differences)} of {NATIONAL_COUNT} species differ")
    for field in FIELDS:
        print(f"{field}: {counts[field]} species differ")


if __name__ == "__main__":
    main()
