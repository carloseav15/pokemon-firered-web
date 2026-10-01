#!/usr/bin/env python3
"""Compare Platinum's first 354 moves with the FireRed data export.

Output: refs/platinum/moves_vs_firered.json, containing only moves whose
type, power, accuracy, PP, priority, or effect chance differs. Platinum data
comes from refs/platinum/moves.json; FireRed data comes from public/fr.

Usage: npm run refs:platinum-moves-vs-firered
"""

from __future__ import annotations

import json
from collections import Counter

from common import ROOT, write_output

PLATINUM_TYPE_TO_FIRERED = {
    "TYPE_NORMAL": 0,
    "TYPE_FIGHTING": 1,
    "TYPE_FLYING": 2,
    "TYPE_POISON": 3,
    "TYPE_GROUND": 4,
    "TYPE_ROCK": 5,
    "TYPE_BUG": 6,
    "TYPE_GHOST": 7,
    "TYPE_STEEL": 8,
    "TYPE_MYSTERY": 9,
    "TYPE_FIRE": 10,
    "TYPE_WATER": 11,
    "TYPE_GRASS": 12,
    "TYPE_ELECTRIC": 13,
    "TYPE_PSYCHIC": 14,
    "TYPE_ICE": 15,
    "TYPE_DRAGON": 16,
    "TYPE_DARK": 17,
}
FIELDS = ("type", "power", "accuracy", "pp", "priority", "effect_chance")
MOVE_COUNT = 355  # ids 0-354; compare ids 1-354


def main() -> None:
    platinum = json.loads((ROOT / "refs/platinum/moves.json").read_text())["data"]
    firered = json.loads((ROOT / "public/fr/data/moves.json").read_text())["moves"]
    if len(platinum) < MOVE_COUNT or len(firered) != MOVE_COUNT:
        raise SystemExit(
            f"expected at least {MOVE_COUNT} Platinum moves and exactly {MOVE_COUNT} FireRed moves, "
            f"found Platinum={len(platinum)} FireRed={len(firered)}"
        )

    differences = []
    counts: Counter[str] = Counter()
    power_accuracy_pp_moves = 0
    for move_id in range(1, MOVE_COUNT):
        p = platinum[move_id]
        f = firered[move_id]
        if p.get("id") != move_id:
            raise SystemExit(f"Platinum move index {move_id} contains id {p.get('id')!r}")
        if f.get("id", move_id) != move_id:
            raise SystemExit(f"FireRed move index {move_id} contains id {f.get('id')!r}")
        type_name = p["type"]
        if type_name not in PLATINUM_TYPE_TO_FIRERED:
            raise SystemExit(f"{p.get('const', move_id)}: unmapped Platinum type {type_name!r}")

        platinum_values = {
            "type": PLATINUM_TYPE_TO_FIRERED[type_name],
            "power": p["power"],
            "accuracy": p["accuracy"],
            "pp": p["pp"],
            "priority": p["priority"],
            "effect_chance": p["effect_chance"],
        }
        firered_values = {
            "type": f["type"],
            "power": f["power"],
            "accuracy": f["accuracy"],
            "pp": f["pp"],
            "priority": f["priority"],
            "effect_chance": f["chance"],
        }
        changes = {}
        for field in FIELDS:
            if firered_values[field] != platinum_values[field]:
                changes[field] = [firered_values[field], platinum_values[field]]
                counts[field] += 1
        if changes:
            differences.append({"id": move_id, "const": p["const"], "cambios": changes})
        if any(field in changes for field in ("power", "accuracy", "pp")):
            power_accuracy_pp_moves += 1

    write_output(
        "platinum",
        "moves_vs_firered.json",
        differences,
        "pokeplatinum",
        "tools/refs/compare_platinum_moves.py",
    )
    print(f"{len(differences)} moves differ; {power_accuracy_pp_moves} change power, accuracy, or PP")
    for field in FIELDS:
        print(f"{field}: {counts[field]} moves differ")


if __name__ == "__main__":
    main()
